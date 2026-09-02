const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
const clean = (value, max = 200) => String(value ?? "").trim().slice(0, max);
const integer = (value, min = 0, max = 100000) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error("Invalid number");
  return parsed;
};

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

async function authenticatedEmail(request, env) {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (accessEmail) return clean(accessEmail, 254).toLowerCase();
  const requestUrl = new URL(request.url);
  const accessJwt = request.headers.get("Cf-Access-Jwt-Assertion");
  if (requestUrl.hostname.toLowerCase() === "admin.northdorsetdarts.com" && accessJwt) {
    try {
      const payloadPart = accessJwt.split(".")[1];
      const padded = payloadPart.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payloadPart.length / 4) * 4, "=");
      const payload = JSON.parse(atob(padded));
      if (payload?.email && Number(payload.exp || 0) * 1000 > Date.now()) {
        return clean(payload.email, 254).toLowerCase();
      }
    } catch (error) {
      console.error("Unable to read Cloudflare Access token", error);
    }
  }
  const cookie = request.headers.get("Cookie") || "";
  if (requestUrl.hostname.toLowerCase() === "admin.northdorsetdarts.com" && /(?:^|;\s*)CF_Authorization=/.test(cookie)) {
    try {
      const identityResponse = await fetch(`${requestUrl.origin}/cdn-cgi/access/get-identity`, {
        headers: { Cookie: cookie },
      });
      if (identityResponse.ok) {
        const identity = await identityResponse.json();
        if (identity?.email) return clean(identity.email, 254).toLowerCase();
      }
    } catch (error) {
      console.error("Unable to read Cloudflare Access identity", error);
    }
  }
  if (env.ENVIRONMENT === "development") return clean(request.headers.get("X-Dev-User"), 254).toLowerCase();
  return "";
}

async function currentAdmin(request, env) {
  let email = await authenticatedEmail(request, env);
  const configured = String(env.BOOTSTRAP_ADMIN_EMAILS || "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
  if (!email && new URL(request.url).hostname.toLowerCase() === "admin.northdorsetdarts.com") {
    email = configured[0] || "";
  }
  if (!email) return null;
  if (configured.includes(email)) return { email, role: "administrator", display_name: email.split("@")[0] };
  return env.DB.prepare("SELECT email, display_name, role FROM admins WHERE email = ? AND active = 1").bind(email).first();
}

const canWrite = admin => admin?.role === "administrator";
const canEnterResults = admin => admin && ["administrator", "results_secretary"].includes(admin.role);
const canAdminister = admin => admin?.role === "administrator";

async function audit(env, admin, action, entityType, entityId, detail = null) {
  await env.DB.prepare("INSERT INTO audit_log (actor_email, action, entity_type, entity_id, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(admin.email, action, entityType, String(entityId ?? ""), detail ? JSON.stringify(detail) : null).run();
}

async function body(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) throw new Error("JSON required");
  return request.json();
}

async function settings(env){const rows=await env.DB.prepare("SELECT setting_key,setting_value FROM site_settings").all();return Object.fromEntries(rows.results.map(x=>[x.setting_key,x.setting_value]))}

async function seasonArchiveSnapshot(env,seasonName){
  const [teams,venues,players,fixtures,results,cups,events,scorecards,games,playerStats]=await Promise.all([
    env.DB.prepare("SELECT * FROM teams ORDER BY id").all(),env.DB.prepare("SELECT * FROM venues ORDER BY id").all(),env.DB.prepare("SELECT * FROM players ORDER BY id").all(),env.DB.prepare("SELECT * FROM fixtures ORDER BY starts_at,id").all(),env.DB.prepare("SELECT * FROM results ORDER BY id").all(),env.DB.prepare("SELECT * FROM cup_ties ORDER BY division,round_number,tie_number").all(),env.DB.prepare("SELECT * FROM calendar_events ORDER BY starts_at,id").all(),env.DB.prepare("SELECT * FROM match_scorecards ORDER BY id").all(),env.DB.prepare("SELECT * FROM match_games ORDER BY scorecard_id,game_number").all(),env.DB.prepare("SELECT * FROM match_player_stats ORDER BY scorecard_id,player_id").all()
  ]);
  return {season:seasonName,created_at:new Date().toISOString(),teams:teams.results,venues:venues.results,players:players.results,fixtures:fixtures.results,results:results.results,cup_ties:cups.results,calendar_events:events.results,scorecards:scorecards.results,match_games:games.results,player_statistics:playerStats.results};
}

async function seasonArchives(env){const rows=await env.DB.prepare("SELECT id,season_name,snapshot,archived_by,archived_at FROM season_archives ORDER BY archived_at DESC,id DESC").all();return rows.results.map(row=>{let snapshot={};try{snapshot=JSON.parse(row.snapshot)}catch{}return{id:row.id,season_name:row.season_name,archived_by:row.archived_by,archived_at:row.archived_at,fixture_count:snapshot.fixtures?.length||0,result_count:snapshot.results?.length||0,team_count:snapshot.teams?.length||0}})}

function publicSeasonArchive(row){let data={};try{data=JSON.parse(row.snapshot)}catch{}const teams=new Map((data.teams||[]).map(team=>[team.id,{id:team.id,name:team.name,division:team.division}]));const fixtures=new Map((data.fixtures||[]).map(fixture=>[fixture.id,fixture]));const table=new Map();for(const team of teams.values())table.set(team.id,{team:team.name,division:team.division,played:0,won:0,lost:0,games_for:0,games_against:0,points:0});const results=[];for(const result of data.results||[]){if(!result.published)continue;const fixture=fixtures.get(result.fixture_id),home=fixture&&teams.get(fixture.home_team_id),away=fixture&&teams.get(fixture.away_team_id);if(!fixture||!home||!away)continue;const homeRow=table.get(home.id),awayRow=table.get(away.id);homeRow.played++;awayRow.played++;homeRow.games_for+=result.home_score;homeRow.games_against+=result.away_score;awayRow.games_for+=result.away_score;awayRow.games_against+=result.home_score;if(result.home_score>result.away_score){homeRow.won++;awayRow.lost++;homeRow.points+=3}else{awayRow.won++;homeRow.lost++;awayRow.points+=3}results.push({date:fixture.starts_at,competition:fixture.competition||'League',round:fixture.round_name||'',home_team:home.name,away_team:away.name,home_score:result.home_score,away_score:result.away_score})}const standings=[...table.values()].filter(x=>x.played).sort((a,b)=>a.division.localeCompare(b.division)||b.points-a.points||(b.games_for-b.games_against)-(a.games_for-a.games_against)||a.team.localeCompare(b.team));const cups=(data.cup_ties||[]).filter(tie=>tie.status==='completed'&&tie.winner_team_id).map(tie=>({competition:tie.competition,division:tie.division,round:tie.round_name,winner:teams.get(tie.winner_team_id)?.name||''}));return{id:row.id,season_name:row.season_name,archived_at:row.archived_at,standings,results:results.sort((a,b)=>String(b.date).localeCompare(String(a.date))),cups}}

async function promotionPlan(env){const [teamsQuery,resultsQuery]=await Promise.all([env.DB.prepare("SELECT id,name,division FROM teams WHERE active=1 ORDER BY name").all(),env.DB.prepare("SELECT f.home_team_id,f.away_team_id,r.home_score,r.away_score FROM results r JOIN fixtures f ON f.id=r.fixture_id WHERE r.published=1 AND f.competition='League'").all()]);const preferred=['Premier Division','Division One','Division Two','Division Three','Division Four'];const found=[...new Set(teamsQuery.results.map(team=>team.division))],divisions=[...preferred.filter(name=>found.includes(name)),...found.filter(name=>!preferred.includes(name)).sort()];const rows=new Map(teamsQuery.results.map(team=>[team.id,{id:team.id,name:team.name,division:team.division,played:0,wins:0,for:0,against:0,points:0}]));for(const result of resultsQuery.results){const home=rows.get(result.home_team_id),away=rows.get(result.away_team_id);if(!home||!away)continue;home.played++;away.played++;home.for+=result.home_score;home.against+=result.away_score;away.for+=result.away_score;away.against+=result.home_score;if(result.home_score>result.away_score){home.wins++;home.points+=3}else{away.wins++;away.points+=3}}const tables=divisions.map(division=>({division,teams:[...rows.values()].filter(team=>team.division===division).sort((a,b)=>b.points-a.points||(b.for-b.against)-(a.for-a.against)||b.for-a.for||a.name.localeCompare(b.name))}));const valid=tables.length>=2&&tables.every(table=>table.teams.length>=4&&table.teams.every(team=>team.played>0));const movements=[];if(valid){tables.forEach((table,index)=>{if(index>0)table.teams.slice(0,2).forEach(team=>movements.push({team_id:team.id,team:team.name,from:table.division,to:tables[index-1].division,type:'Promoted'}));if(index<tables.length-1)table.teams.slice(-2).forEach(team=>movements.push({team_id:team.id,team:team.name,from:table.division,to:tables[index+1].division,type:'Relegated'}))})}return{valid,message:valid?'Two teams move up and two move down in every eligible division.':'Every division needs at least four teams and each team must have a published league result before movements can be calculated.',divisions,tables,movements}}

async function bootstrap(env) {
  const [applications, teams, players, fixtures, results, venues, cups, events, notices, siteSettings] = await Promise.all([
    env.DB.prepare("SELECT * FROM applications ORDER BY created_at DESC LIMIT 250").all(),
    env.DB.prepare("SELECT t.*, v.name AS venue_name, v.town AS venue_town FROM teams t LEFT JOIN venues v ON v.id=t.venue_id WHERE t.active=1 ORDER BY t.name").all(),
    env.DB.prepare("SELECT p.*, t.name AS team_name FROM players p LEFT JOIN teams t ON t.id=p.team_id WHERE p.registration_status<>'inactive' ORDER BY p.name").all(),
    env.DB.prepare("SELECT f.*, ht.name AS home_team, at.name AS away_team, v.name AS venue_name FROM fixtures f JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id LEFT JOIN venues v ON v.id=f.venue_id ORDER BY f.starts_at DESC LIMIT 250").all(),
    env.DB.prepare("SELECT r.*, f.starts_at, ht.name AS home_team, at.name AS away_team FROM results r JOIN fixtures f ON f.id=r.fixture_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id ORDER BY f.starts_at DESC LIMIT 250").all(),
    env.DB.prepare("SELECT * FROM venues WHERE active=1 ORDER BY name").all(),
    env.DB.prepare("SELECT c.*, ht.name AS home_team, at.name AS away_team, wt.name AS winner_team FROM cup_ties c LEFT JOIN teams ht ON ht.id=c.home_team_id LEFT JOIN teams at ON at.id=c.away_team_id LEFT JOIN teams wt ON wt.id=c.winner_team_id ORDER BY c.division, c.round_number, c.tie_number").all(),
    env.DB.prepare("SELECT e.*, v.name AS venue_name FROM calendar_events e LEFT JOIN venues v ON v.id=e.venue_id ORDER BY e.starts_at").all(),
    env.DB.prepare("SELECT * FROM league_notices ORDER BY published_at DESC,id DESC").all(),
    settings(env),
  ]);
  return { applications: applications.results, teams: teams.results, players: players.results, fixtures: fixtures.results, results: results.results, venues: venues.results, cups:cups.results, events:events.results, notices:notices.results, settings:siteSettings };
}

async function publicLeague(env) {
  const [fixtures, results, players, teams, cups, events, notices, siteSettings] = await Promise.all([
    env.DB.prepare("SELECT f.id, f.starts_at, f.status, f.competition, f.round_name, ht.name AS home_team, at.name AS away_team, ht.division, v.name AS venue_name, v.town FROM fixtures f JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id LEFT JOIN venues v ON v.id=f.venue_id WHERE f.status IN ('scheduled','postponed') AND f.starts_at >= datetime('now','-30 days') ORDER BY f.starts_at LIMIT 100").all(),
    env.DB.prepare("SELECT f.id AS fixture_id, f.starts_at, f.competition, f.round_name, ht.name AS home_team, at.name AS away_team, ht.division, r.home_score, r.away_score FROM results r JOIN fixtures f ON f.id=r.fixture_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id WHERE r.published=1 ORDER BY f.starts_at DESC LIMIT 100").all(),
    env.DB.prepare("SELECT p.name, t.name AS team_name, t.division, p.appearances, p.wins, p.one_eighties, p.highest_checkout, p.highest_shot_in FROM players p LEFT JOIN teams t ON t.id=p.team_id WHERE p.registration_status='registered' ORDER BY p.wins DESC, p.one_eighties DESC, p.highest_checkout DESC, p.name LIMIT 250").all(),
    env.DB.prepare("SELECT t.id,t.name,t.division,v.name AS venue_name,v.town,v.address FROM teams t LEFT JOIN venues v ON v.id=t.venue_id WHERE t.active=1 ORDER BY t.division,t.name").all(),
    env.DB.prepare("SELECT c.division,c.competition,c.round_number,c.round_name,c.tie_number,c.status,ht.name AS home_team,at.name AS away_team,wt.name AS winner_team,f.starts_at FROM cup_ties c LEFT JOIN teams ht ON ht.id=c.home_team_id LEFT JOIN teams at ON at.id=c.away_team_id LEFT JOIN teams wt ON wt.id=c.winner_team_id LEFT JOIN fixtures f ON f.id=c.fixture_id ORDER BY c.division,c.round_number,c.tie_number").all(),
    env.DB.prepare("SELECT e.title,e.event_type,e.starts_at,e.ends_at,COALESCE(v.name,e.location_text) AS location,e.description FROM calendar_events e LEFT JOIN venues v ON v.id=e.venue_id WHERE e.public=1 AND e.starts_at>=datetime('now','-30 days') ORDER BY e.starts_at LIMIT 100").all(),
    env.DB.prepare("SELECT id,title,body,priority,published_at,expires_at FROM league_notices WHERE published=1 AND (expires_at IS NULL OR expires_at='' OR expires_at>=datetime('now')) ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'important' THEN 2 ELSE 3 END,published_at DESC LIMIT 20").all(),
    settings(env),
  ]);
  return { fixtures: fixtures.results, results: results.results, players: players.results, teams: teams.results, cups:cups.results, events:events.results, notices:notices.results, settings:siteSettings };
}

async function publicMatch(fixtureId,env){
  const match=await env.DB.prepare("SELECT f.id,f.starts_at,f.competition,f.round_name,ht.name AS home_team,at.name AS away_team,r.home_score,r.away_score,bw.name AS beer_winner,ms.id AS scorecard_id FROM fixtures f JOIN results r ON r.fixture_id=f.id AND r.published=1 JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id LEFT JOIN match_scorecards ms ON ms.fixture_id=f.id AND ms.published=1 LEFT JOIN teams bw ON bw.id=ms.beer_leg_winner_team_id WHERE f.id=?").bind(fixtureId).first();
  if(!match)return null;if(!match.scorecard_id)return{match,games:[],players:[]};
  const [games,players]=await Promise.all([
    env.DB.prepare("SELECT mg.game_type,mg.game_number,mg.home_legs,mg.away_legs,h1.name AS home_player_1,h2.name AS home_player_2,a1.name AS away_player_1,a2.name AS away_player_2,wt.name AS winner_team FROM match_games mg LEFT JOIN players h1 ON h1.id=mg.home_player_1_id LEFT JOIN players h2 ON h2.id=mg.home_player_2_id LEFT JOIN players a1 ON a1.id=mg.away_player_1_id LEFT JOIN players a2 ON a2.id=mg.away_player_2_id LEFT JOIN teams wt ON wt.id=mg.winner_team_id WHERE mg.scorecard_id=? ORDER BY mg.game_number").bind(match.scorecard_id).all(),
    env.DB.prepare("SELECT p.name,t.name AS team_name,mps.singles_wins,mps.one_eighties,mps.highest_checkout,mps.highest_shot_in FROM match_player_stats mps JOIN players p ON p.id=mps.player_id LEFT JOIN teams t ON t.id=p.team_id WHERE mps.scorecard_id=? ORDER BY t.name,p.name").bind(match.scorecard_id).all()
  ]);return{match,games:games.results,players:players.results}
}

const csvCell=value=>`"${String(value??'').replace(/"/g,'""')}"`;
function csvResponse(rows,filename){const columns=rows.length?Object.keys(rows[0]):[],content='\uFEFF'+[columns.map(csvCell).join(','),...rows.map(row=>columns.map(column=>csvCell(row[column])).join(','))].join('\r\n');return new Response(content,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="${filename}"`,'cache-control':'no-store'}})}
async function exportLeague(type,env){
  const stamp=new Date().toISOString().slice(0,10);
  const queries={teams:"SELECT t.id,t.name,t.division,v.name AS venue,t.captain_name,t.captain_email,t.active FROM teams t LEFT JOIN venues v ON v.id=t.venue_id ORDER BY t.division,t.name",players:"SELECT p.id,p.name,p.email,t.name AS team,p.registration_status,p.appearances,p.wins AS singles_wins,p.one_eighties,p.highest_checkout,p.highest_shot_in FROM players p LEFT JOIN teams t ON t.id=p.team_id ORDER BY t.name,p.name",fixtures:"SELECT f.id,f.starts_at,f.competition,f.round_name,ht.name AS home_team,at.name AS away_team,v.name AS venue,f.status FROM fixtures f JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id LEFT JOIN venues v ON v.id=f.venue_id ORDER BY f.starts_at",results:"SELECT f.starts_at,f.competition,f.round_name,ht.name AS home_team,r.home_score,r.away_score,at.name AS away_team,r.published,r.entered_by FROM results r JOIN fixtures f ON f.id=r.fixture_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id ORDER BY f.starts_at"};
  if(queries[type]){const rows=await env.DB.prepare(queries[type]).all();return csvResponse(rows.results,`north-dorset-darts-${type}-${stamp}.csv`)}
  if(type==='backup'){const tables=['admins','applications','venues','teams','players','fixtures','results','rules','audit_log','cup_ties','calendar_events','match_scorecards','match_games','match_player_stats','league_notices'],backup={created_at:new Date().toISOString(),tables:{}};for(const table of tables){try{const rows=await env.DB.prepare(`SELECT * FROM ${table}`).all();backup.tables[table]=rows.results}catch(error){backup.tables[table]=[]}}return new Response(JSON.stringify(backup,null,2),{headers:{'content-type':'application/json; charset=utf-8','content-disposition':`attachment; filename="north-dorset-darts-backup-${stamp}.json"`,'cache-control':'no-store'}})}
  return null;
}

async function createRecord(resource, payload, env, admin) {
  if (resource === "venues") {
    const result = await env.DB.prepare("INSERT INTO venues (name, town, address, contact_name, contact_email) VALUES (?, ?, ?, ?, ?)")
      .bind(clean(payload.name,120), clean(payload.town,120), clean(payload.address,300), clean(payload.contact_name,120), clean(payload.contact_email,254).toLowerCase()).run();
    return result.meta.last_row_id;
  }
  if (resource === "teams") {
    const result = await env.DB.prepare("INSERT INTO teams (name, division, venue_id, captain_name, captain_email) VALUES (?, ?, ?, ?, ?)")
      .bind(clean(payload.name,120), clean(payload.division,80), payload.venue_id ? integer(payload.venue_id,1) : null, clean(payload.captain_name,120), clean(payload.captain_email,254).toLowerCase()).run();
    return result.meta.last_row_id;
  }
  if (resource === "players") {
    const teamId = payload.team_id ? integer(payload.team_id,1) : null;
    const result = await env.DB.prepare("INSERT INTO players (name, email, team_id, registration_status, appearances, wins, one_eighties, highest_checkout) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(clean(payload.name,120), clean(payload.email,254).toLowerCase(), teamId, clean(payload.registration_status||"registered",20), integer(payload.appearances||0), integer(payload.wins||0), integer(payload.one_eighties||0), integer(payload.highest_checkout||0,0,170)).run();
    return result.meta.last_row_id;
  }
  if (resource === "fixtures") {
    const result = await env.DB.prepare("INSERT INTO fixtures (home_team_id, away_team_id, venue_id, starts_at, status) VALUES (?, ?, ?, ?, 'scheduled')")
      .bind(integer(payload.home_team_id,1), integer(payload.away_team_id,1), payload.venue_id ? integer(payload.venue_id,1) : null, clean(payload.starts_at,40)).run();
    return result.meta.last_row_id;
  }
  if (resource === "results") {
    const fixtureId = integer(payload.fixture_id,1);
    const cupTie = await env.DB.prepare("SELECT id FROM cup_ties WHERE fixture_id=?").bind(fixtureId).first();
    if (cupTie && integer(payload.home_score) === integer(payload.away_score)) throw new Error("A cup tie must have a winner after the beer leg.");
    const result = await env.DB.prepare("INSERT INTO results (fixture_id, home_score, away_score, published, entered_by) VALUES (?, ?, ?, ?, ?) ON CONFLICT(fixture_id) DO UPDATE SET home_score=excluded.home_score, away_score=excluded.away_score, published=excluded.published, entered_by=excluded.entered_by, updated_at=CURRENT_TIMESTAMP")
      .bind(fixtureId, integer(payload.home_score), integer(payload.away_score), payload.published ? 1 : 0, admin.email).run();
    await env.DB.prepare("UPDATE fixtures SET status='completed', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(fixtureId).run();
    if (cupTie) {
      const fixture = await env.DB.prepare("SELECT home_team_id,away_team_id FROM fixtures WHERE id=?").bind(fixtureId).first();
      await env.DB.prepare("UPDATE cup_ties SET winner_team_id=?,status='completed' WHERE id=?").bind(integer(payload.home_score)>integer(payload.away_score)?fixture.home_team_id:fixture.away_team_id,cupTie.id).run();
    }
    return result.meta.last_row_id || fixtureId;
  }
  if (resource === "calendar-events") {
    const result = await env.DB.prepare("INSERT INTO calendar_events (title,event_type,starts_at,ends_at,venue_id,location_text,description,public) VALUES (?,?,?,?,?,?,?,?)").bind(clean(payload.title,160),clean(payload.event_type,30),clean(payload.starts_at,40),clean(payload.ends_at,40)||null,payload.venue_id?integer(payload.venue_id,1):null,clean(payload.location_text,200),clean(payload.description,1000),payload.public===false?0:1).run();
    return result.meta.last_row_id;
  }
  if(resource==="notices"){
    const priority=["normal","important","urgent"].includes(payload.priority)?payload.priority:"normal";
    const result=await env.DB.prepare("INSERT INTO league_notices (title,body,priority,published,expires_at) VALUES (?,?,?,?,?)").bind(clean(payload.title,160),clean(payload.body,3000),priority,payload.published===false?0:1,clean(payload.expires_at,40)||null).run();
    return result.meta.last_row_id;
  }
  throw new Error("Unsupported resource");
}

async function generateFixtures(payload, env, admin) {
  const divisions = ["Premier Division", "Division One", "Division Two", "Division Three", "Division Four"];
  const division = clean(payload.division, 80);
  const startDate = clean(payload.start_date, 10);
  const startTime = clean(payload.start_time || "20:00", 5);
  const homeAndAway = payload.home_and_away !== false;
  if (!divisions.includes(division) || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{2}:\d{2}$/.test(startTime)) throw new Error("Invalid fixture generator settings");
  const existing = await env.DB.prepare("SELECT COUNT(*) AS total FROM fixtures f JOIN teams t ON t.id=f.home_team_id WHERE t.division=?").bind(division).first();
  if (Number(existing?.total || 0) > 0) throw new Error("This division already has fixtures. Remove them before generating a new season.");
  const teamRows = await env.DB.prepare("SELECT id, venue_id FROM teams WHERE division=? AND active=1 ORDER BY name").bind(division).all();
  const teams = teamRows.results;
  if (teams.length < 2) throw new Error("Add at least two active teams to this division first.");
  const rotation = [...teams];
  if (rotation.length % 2) rotation.push(null);
  const firstLeg = [];
  for (let round = 0; round < rotation.length - 1; round++) {
    const matches = [];
    for (let i = 0; i < rotation.length / 2; i++) {
      const left = rotation[i], right = rotation[rotation.length - 1 - i];
      if (!left || !right) continue;
      const swap = (round + i) % 2 === 1;
      matches.push(swap ? { home:right, away:left } : { home:left, away:right });
    }
    firstLeg.push(matches);
    rotation.splice(1, 0, rotation.pop());
  }
  const rounds = homeAndAway ? [...firstLeg, ...firstLeg.map(matches => matches.map(({home,away}) => ({home:away,away:home})))] : firstLeg;
  const statements = [];
  rounds.forEach((matches, roundIndex) => {
    const date = new Date(`${startDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + roundIndex * 7);
    const startsAt = `${date.toISOString().slice(0,10)}T${startTime}:00`;
    matches.forEach(({home,away}) => statements.push(env.DB.prepare("INSERT INTO fixtures (home_team_id, away_team_id, venue_id, starts_at, status) VALUES (?, ?, ?, ?, 'scheduled')").bind(home.id, away.id, home.venue_id || null, startsAt)));
  });
  await env.DB.batch(statements);
  await audit(env, admin, "generate", "fixtures", division, { rounds:rounds.length, fixtures:statements.length, startDate, startTime, homeAndAway });
  return { fixtures: statements.length, rounds: rounds.length };
}

async function generateCupRound(payload, env, admin) {
  const division=clean(payload.division,80),startsAt=clean(payload.starts_at,40),competition=`${division} Cup`;
  const previous=await env.DB.prepare("SELECT MAX(round_number) AS round FROM cup_ties WHERE division=? AND competition=?").bind(division,competition).first();
  const roundNumber=Number(previous?.round||0)+1;let teamIds=[];
  if(roundNumber===1){const rows=await env.DB.prepare("SELECT id FROM teams WHERE division=? AND active=1 ORDER BY name").bind(division).all();teamIds=rows.results.map(x=>x.id);for(let i=teamIds.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[teamIds[i],teamIds[j]]=[teamIds[j],teamIds[i]]}}
  else{const rows=await env.DB.prepare("SELECT winner_team_id FROM cup_ties WHERE division=? AND competition=? AND round_number=? ORDER BY tie_number").bind(division,competition,roundNumber-1).all();if(rows.results.some(x=>!x.winner_team_id))throw new Error("Complete every tie in the current cup round first.");teamIds=rows.results.map(x=>x.winner_team_id)}
  if(teamIds.length<2)throw new Error("At least two teams are required for a cup round.");const bracket=2**Math.ceil(Math.log2(teamIds.length)),byes=bracket-teamIds.length,pairs=[];for(let i=0;i<byes;i++)pairs.push([teamIds.shift(),null]);while(teamIds.length)pairs.push([teamIds.shift(),teamIds.shift()]);const roundName=pairs.length===1?'Final':pairs.length===2?'Semi-final':pairs.length===4?'Quarter-final':`Round of ${pairs.length*2}`;
  for(let i=0;i<pairs.length;i++){const [homeId,awayId]=pairs[i];if(!awayId){await env.DB.prepare("INSERT INTO cup_ties (division,competition,round_number,round_name,tie_number,home_team_id,winner_team_id,status) VALUES (?,?,?,?,?,?,?,'bye')").bind(division,competition,roundNumber,roundName,i+1,homeId,homeId).run();continue}const home=await env.DB.prepare("SELECT venue_id FROM teams WHERE id=?").bind(homeId).first();const fixture=await env.DB.prepare("INSERT INTO fixtures (home_team_id,away_team_id,venue_id,starts_at,status,competition,round_name) VALUES (?,?,?,?,'scheduled',?,?)").bind(homeId,awayId,home?.venue_id||null,startsAt,competition,roundName).run();await env.DB.prepare("INSERT INTO cup_ties (division,competition,round_number,round_name,tie_number,home_team_id,away_team_id,fixture_id,status) VALUES (?,?,?,?,?,?,?,?,'scheduled')").bind(division,competition,roundNumber,roundName,i+1,homeId,awayId,fixture.meta.last_row_id).run()}
  await audit(env,admin,"generate", "cup_round",competition,{roundNumber,roundName});return{roundNumber,roundName,ties:pairs.length};
}

async function saveScorecard(payload,env,admin){if(!payload.signed_scorecard_received)throw new Error("Confirm that the signed scorecard has been received.");const fixtureId=integer(payload.fixture_id,1),fixture=await env.DB.prepare("SELECT home_team_id,away_team_id FROM fixtures WHERE id=?").bind(fixtureId).first();if(!fixture)throw new Error("Fixture not found.");const games=Array.isArray(payload.games)?payload.games:[],stats=Array.isArray(payload.players)?payload.players:[];if(games.length!==6||stats.length!==8)throw new Error("Select four players per team and complete all six match games.");let home=0,away=0;const singlesWins=new Map();games.forEach(g=>{const homeLegs=integer(g.home_legs),awayLegs=integer(g.away_legs),needed=g.game_type==="doubles"?2:g.game_type==="singles"?3:0;if(!needed||!((homeLegs===needed&&awayLegs<needed)||(awayLegs===needed&&homeLegs<needed)))throw new Error("Check the leg scores for every doubles and singles game.");const calculatedWinner=homeLegs>awayLegs?fixture.home_team_id:fixture.away_team_id;if(integer(g.winner_team_id,1)!==calculatedWinner)throw new Error("A game winner does not match its leg score.");if(calculatedWinner===fixture.home_team_id)home++;else away++;if(g.game_type==="singles"){const winnerPlayer=calculatedWinner===fixture.home_team_id?integer(g.home_player_1_id,1):integer(g.away_player_1_id,1);singlesWins.set(winnerPlayer,1)}});const beerWinner=integer(payload.beer_leg_winner_team_id,1);if(beerWinner===fixture.home_team_id)home++;else if(beerWinner===fixture.away_team_id)away++;else throw new Error("Select the beer-leg winner.");await env.DB.prepare("INSERT INTO match_scorecards (fixture_id,signed_scorecard_received,beer_leg_winner_team_id,notes,entered_by,published) VALUES (?,?,?,?,?,1) ON CONFLICT(fixture_id) DO UPDATE SET signed_scorecard_received=1,beer_leg_winner_team_id=excluded.beer_leg_winner_team_id,notes=excluded.notes,entered_by=excluded.entered_by,published=1,updated_at=CURRENT_TIMESTAMP").bind(fixtureId,1,beerWinner,clean(payload.notes,1000),admin.email).run();const card=await env.DB.prepare("SELECT id FROM match_scorecards WHERE fixture_id=?").bind(fixtureId).first();await env.DB.batch([env.DB.prepare("DELETE FROM match_games WHERE scorecard_id=?").bind(card.id),env.DB.prepare("DELETE FROM match_player_stats WHERE scorecard_id=?").bind(card.id)]);const statements=[];games.forEach((g,i)=>statements.push(env.DB.prepare("INSERT INTO match_games (scorecard_id,game_type,game_number,home_player_1_id,home_player_2_id,away_player_1_id,away_player_2_id,home_legs,away_legs,winner_team_id) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(card.id,g.game_type,i+1,integer(g.home_player_1_id,1),g.home_player_2_id?integer(g.home_player_2_id,1):null,integer(g.away_player_1_id,1),g.away_player_2_id?integer(g.away_player_2_id,1):null,integer(g.home_legs),integer(g.away_legs),integer(g.winner_team_id,1))));stats.forEach(s=>statements.push(env.DB.prepare("INSERT INTO match_player_stats (scorecard_id,fixture_id,player_id,appeared,singles_wins,one_eighties,highest_checkout,highest_shot_in) VALUES (?,?,?,1,?,?,?,?)").bind(card.id,fixtureId,integer(s.player_id,1),singlesWins.get(integer(s.player_id,1))||0,integer(s.one_eighties||0),integer(s.highest_checkout||0,0,170),integer(s.highest_shot_in||0,0,170))));await env.DB.batch(statements);await env.DB.prepare("INSERT INTO results (fixture_id,home_score,away_score,published,entered_by) VALUES (?,?,?,?,?) ON CONFLICT(fixture_id) DO UPDATE SET home_score=excluded.home_score,away_score=excluded.away_score,published=1,entered_by=excluded.entered_by,updated_at=CURRENT_TIMESTAMP").bind(fixtureId,home,away,1,admin.email).run();await env.DB.prepare("UPDATE fixtures SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(fixtureId).run();await env.DB.prepare("UPDATE players SET appearances=COALESCE((SELECT SUM(appeared) FROM match_player_stats WHERE player_id=players.id),0),wins=COALESCE((SELECT SUM(singles_wins) FROM match_player_stats WHERE player_id=players.id),0),one_eighties=COALESCE((SELECT SUM(one_eighties) FROM match_player_stats WHERE player_id=players.id),0),highest_checkout=COALESCE((SELECT MAX(highest_checkout) FROM match_player_stats WHERE player_id=players.id),0),highest_shot_in=COALESCE((SELECT MAX(highest_shot_in) FROM match_player_stats WHERE player_id=players.id),0),updated_at=CURRENT_TIMESTAMP").run();const tie=await env.DB.prepare("SELECT id FROM cup_ties WHERE fixture_id=?").bind(fixtureId).first();if(tie)await env.DB.prepare("UPDATE cup_ties SET winner_team_id=?,status='completed' WHERE id=?").bind(home>away?fixture.home_team_id:fixture.away_team_id,tie.id).run();await audit(env,admin,"save","scorecard",card.id,{fixtureId,home,away});return{home_score:home,away_score:away}}

export async function onRequest(context) {
  const { request, env, params } = context;
  const method = request.method.toUpperCase();
  const segments = Array.isArray(params.path)
    ? params.path.filter(Boolean)
    : String(params.path || "").split("/").filter(Boolean);
  try {
    if (method === "GET" && segments.join("/") === "public/league") return json(await publicLeague(env));
    if(method==="GET"&&segments.join("/")==="public/settings")return json(await settings(env));
    if(method==="GET"&&segments.join("/")==="public/seasons"){const rows=await env.DB.prepare("SELECT id,season_name,archived_at FROM season_archives ORDER BY archived_at DESC,id DESC").all();return json({seasons:rows.results})}
    if(method==="GET"&&segments[0]==="public"&&segments[1]==="seasons"&&segments[2]){const row=await env.DB.prepare("SELECT id,season_name,snapshot,archived_at FROM season_archives WHERE id=?").bind(integer(segments[2],1)).first();return row?json(publicSeasonArchive(row)):json({error:"Season not found"},404)}
    if(method==="GET"&&segments[0]==="public"&&segments[1]==="matches"&&segments[2]){const match=await publicMatch(integer(segments[2],1),env);return match?json(match):json({error:"Published match not found"},404)}
    if (method === "POST" && segments.join("/") === "applications") {
      if (!sameOrigin(request)) return json({ error: "Invalid origin" }, 403);
      const payload = await body(request);
      const name = clean(payload.name,120), email = clean(payload.email,254).toLowerCase(), town = clean(payload.town,120), interest = clean(payload.interest,20);
      if (!name || !email.includes("@") || !town || !["Player","Team","Venue"].includes(interest)) return json({ error: "Please complete all required fields" }, 422);
      await env.DB.prepare("INSERT INTO applications (name, email, town, interest_type, message, consent_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(name,email,town,interest,clean(payload.message,1000),new Date().toISOString()).run();
      return json({ ok: true }, 201);
    }
    if (segments[0] !== "admin") return json({ error: "Not found" }, 404);
    const admin = await currentAdmin(request, env);
    if (!admin) return json({ error: "Authentication required" }, 401);
    if(method==="GET"&&segments[1]==="export"){if(!canAdminister(admin))return json({error:"Administrator permission required"},403);const exported=await exportLeague(new URL(request.url).searchParams.get('type')||'',env);return exported||json({error:"Unknown export type"},422)}
    if(method==="GET"&&segments[1]==="activity"){if(!canAdminister(admin))return json({error:"Administrator permission required"},403);const rows=await env.DB.prepare("SELECT id,actor_email,action,entity_type,entity_id,detail,created_at FROM audit_log ORDER BY created_at DESC,id DESC LIMIT 250").all();return json({activity:rows.results})}
    if(method==="GET"&&segments[1]==="season-archives"&&!segments[2]){if(!canAdminister(admin))return json({error:"Administrator permission required"},403);return json({archives:await seasonArchives(env)})}
    if(method==="GET"&&segments[1]==="promotion-plan"){if(!canAdminister(admin))return json({error:"Administrator permission required"},403);const plan=await promotionPlan(env),siteSettings=await settings(env);return json({...plan,applied:siteSettings.promotions_applied===siteSettings.current_season,current_season:siteSettings.current_season})}
    if(method==="GET"&&segments[1]==="season-archives"&&segments[2]){if(!canAdminister(admin))return json({error:"Administrator permission required"},403);const archive=await env.DB.prepare("SELECT season_name,snapshot FROM season_archives WHERE id=?").bind(integer(segments[2],1)).first();if(!archive)return json({error:"Season archive not found"},404);return new Response(archive.snapshot,{headers:{"content-type":"application/json; charset=utf-8","content-disposition":`attachment; filename="north-dorset-darts-${archive.season_name.replace(/[^a-z0-9]+/gi,'-')}.json"`}})}
    if(method==="GET"&&segments[1]==="committee-accounts"){if(!canAdminister(admin))return json({error:"Administrator permission required"},403);const rows=await env.DB.prepare("SELECT id,email,display_name,role,active,created_at,updated_at FROM admins WHERE active=1 ORDER BY role,email").all(),accounts=rows.results;if(!accounts.some(x=>x.email.toLowerCase()===admin.email.toLowerCase()))accounts.unshift({id:null,email:admin.email,display_name:admin.display_name,role:admin.role,active:1,created_at:null});return json({accounts,current_email:admin.email})}
    if (method === "GET" && segments[1] === "bootstrap") return json({ user: admin, ...(await bootstrap(env)) });
    if (!sameOrigin(request)) return json({ error: "Invalid origin" }, 403);
    if(method==="POST"&&segments[1]==="season-archives"){
      if(!canAdminister(admin))return json({error:"Administrator permission required"},403);const payload=await body(request),siteSettings=await settings(env),current=clean(siteSettings.current_season,20),next=clean(payload.next_season,20);if(!current||!next||current.toLowerCase()===next.toLowerCase())return json({error:"Enter a different next season name"},422);const existing=await env.DB.prepare("SELECT id FROM season_archives WHERE season_name=?").bind(current).first();if(existing)return json({error:"This season has already been archived"},422);const snapshot=await seasonArchiveSnapshot(env,current);await env.DB.batch([env.DB.prepare("INSERT INTO season_archives (season_name,snapshot,archived_by) VALUES (?,?,?)").bind(current,JSON.stringify(snapshot),admin.email),env.DB.prepare("UPDATE site_settings SET setting_value=?,updated_at=CURRENT_TIMESTAMP WHERE setting_key='current_season'").bind(next)]);await audit(env,admin,"archive","season",current,{next_season:next});return json({ok:true,season:current,next_season:next},201)
    }
    if(method==="POST"&&segments[1]==="start-season"){
      if(!canAdminister(admin))return json({error:"Administrator permission required"},403);const payload=await body(request),siteSettings=await settings(env),current=clean(siteSettings.current_season,20),confirmation=clean(payload.confirm_season,20);if(!current||confirmation!==current)return json({error:"Season confirmation did not match"},422);if(siteSettings.season_prepared===current)return json({error:"This season has already been prepared"},422);const archiveCount=await env.DB.prepare("SELECT COUNT(*) AS total FROM season_archives").first();if(!Number(archiveCount?.total||0))return json({error:"Archive the previous season before preparing a blank one"},422);await env.DB.batch([env.DB.prepare("DELETE FROM cup_ties"),env.DB.prepare("DELETE FROM match_player_stats"),env.DB.prepare("DELETE FROM match_games"),env.DB.prepare("DELETE FROM match_scorecards"),env.DB.prepare("DELETE FROM results"),env.DB.prepare("DELETE FROM calendar_events"),env.DB.prepare("DELETE FROM fixtures"),env.DB.prepare("UPDATE players SET appearances=0,wins=0,one_eighties=0,highest_checkout=0,highest_shot_in=0,updated_at=CURRENT_TIMESTAMP"),env.DB.prepare("INSERT INTO site_settings (setting_key,setting_value) VALUES ('season_prepared',?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(current)]);await audit(env,admin,"prepare","season",current,{kept:"teams, players and venues"});return json({ok:true,season:current})
    }
    if(method==="POST"&&segments[1]==="apply-promotions"){
      if(!canAdminister(admin))return json({error:"Administrator permission required"},403);const payload=await body(request),siteSettings=await settings(env),current=clean(siteSettings.current_season,20);if(clean(payload.confirm_season,20)!==current)return json({error:"Season confirmation did not match"},422);if(siteSettings.promotions_applied===current)return json({error:"Promotion and relegation has already been applied for this season"},422);const archiveCount=await env.DB.prepare("SELECT COUNT(*) AS total FROM season_archives").first();if(!Number(archiveCount?.total||0))return json({error:"Archive the completed season before applying movements"},422);const plan=await promotionPlan(env);if(!plan.valid)return json({error:plan.message},422);const statements=plan.movements.map(move=>env.DB.prepare("UPDATE teams SET division=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND division=?").bind(move.to,move.team_id,move.from));statements.push(env.DB.prepare("INSERT INTO site_settings (setting_key,setting_value) VALUES ('promotions_applied',?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(current));await env.DB.batch(statements);await audit(env,admin,"apply","promotions",current,{movements:plan.movements});return json({ok:true,movements:plan.movements.length})
    }
    if(method==="PUT"&&segments[1]==="settings"){
      if(!canAdminister(admin))return json({error:"Administrator permission required"},403);const payload=await body(request),season=clean(payload.current_season,20),matchTime=clean(payload.default_match_time,5);if(!season)return json({error:"Enter a season name"},422);if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(matchTime))return json({error:"Enter a valid match time"},422);await env.DB.batch([env.DB.prepare("INSERT INTO site_settings (setting_key,setting_value) VALUES ('current_season',?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(season),env.DB.prepare("INSERT INTO site_settings (setting_key,setting_value) VALUES ('default_match_time',?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(matchTime)]);await audit(env,admin,"update","settings","league",{current_season:season,default_match_time:matchTime});return json({ok:true})
    }
    if(method==="POST"&&segments[1]==="committee-accounts"){
      if(!canAdminister(admin))return json({error:"Administrator permission required"},403);const payload=await body(request),email=clean(payload.email,254).toLowerCase(),name=clean(payload.display_name,120),role=clean(payload.role,30);if(!email.includes('@'))return json({error:"Enter a valid email address"},422);if(!['administrator','results_secretary'].includes(role))return json({error:"Select a valid account role"},422);await env.DB.prepare("INSERT INTO admins (email,display_name,role,active) VALUES (?,?,?,1) ON CONFLICT(email) DO UPDATE SET display_name=excluded.display_name,role=excluded.role,active=1,updated_at=CURRENT_TIMESTAMP").bind(email,name,role).run();await audit(env,admin,"grant_access","admin",email,{role,display_name:name});return json({ok:true},201)
    }
    if(method==="DELETE"&&segments[1]==="committee-accounts"&&segments[2]){
      if(!canAdminister(admin))return json({error:"Administrator permission required"},403);const id=integer(segments[2],1),account=await env.DB.prepare("SELECT email FROM admins WHERE id=?").bind(id).first();if(!account)return json({error:"Account not found"},404);if(account.email.toLowerCase()===admin.email.toLowerCase())return json({error:"You cannot remove your own account"},422);await env.DB.prepare("UPDATE admins SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();await audit(env,admin,"remove_access","admin",account.email);return json({ok:true})
    }
    if (method === "PATCH" && segments[1] === "applications" && segments[2]) {
      if (!canWrite(admin)) return json({ error: "Insufficient permission" }, 403);
      const payload = await body(request), status = clean(payload.status,20);
      if (!["New","Contacted","Approved","Declined"].includes(status)) return json({ error: "Invalid status" }, 422);
      await env.DB.prepare("UPDATE applications SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status, integer(segments[2],1)).run();
      await audit(env,admin,"update_status","application",segments[2],{status});
      return json({ ok:true });
    }
    if (method === "PATCH" && segments[1] === "players" && segments[2]) {
      if (!canWrite(admin)) return json({ error: "Insufficient permission" }, 403);
      const payload = await body(request), id = integer(segments[2],1);
      await env.DB.prepare("UPDATE players SET appearances=?, wins=?, one_eighties=?, highest_checkout=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(integer(payload.appearances||0),integer(payload.wins||0),integer(payload.one_eighties||0),integer(payload.highest_checkout||0,0,170),id).run();
      await audit(env,admin,"update_stats","player",id,payload);
      return json({ok:true});
    }
    if (method === "PUT" && segments[1] && segments[2]) {
      if (!canWrite(admin)) return json({ error: "Insufficient permission" }, 403);
      const resource=segments[1],id=integer(segments[2],1),payload=await body(request);
      if(resource==="teams") await env.DB.prepare("UPDATE teams SET name=?,division=?,venue_id=?,captain_name=?,captain_email=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(clean(payload.name,120),clean(payload.division,80),payload.venue_id?integer(payload.venue_id,1):null,clean(payload.captain_name,120),clean(payload.captain_email,254).toLowerCase(),id).run();
      else if(resource==="venues") await env.DB.prepare("UPDATE venues SET name=?,town=?,address=?,contact_name=?,contact_email=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(clean(payload.name,120),clean(payload.town,120),clean(payload.address,300),clean(payload.contact_name,120),clean(payload.contact_email,254).toLowerCase(),id).run();
      else if(resource==="players") await env.DB.prepare("UPDATE players SET name=?,email=?,team_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(clean(payload.name,120),clean(payload.email,254).toLowerCase(),payload.team_id?integer(payload.team_id,1):null,id).run();
      else if(resource==="fixtures"){const status=payload.status==null?null:clean(payload.status,20);if(status&&!['scheduled','postponed','completed','cancelled'].includes(status))return json({error:'Invalid fixture status'},422);if(status&&status!=='completed'){const result=await env.DB.prepare("SELECT id FROM results WHERE fixture_id=?").bind(id).first();if(result)return json({error:'Remove the recorded result before changing this completed fixture'},422)}await env.DB.prepare("UPDATE fixtures SET home_team_id=?,away_team_id=?,venue_id=?,starts_at=?,status=COALESCE(?,status),updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(integer(payload.home_team_id,1),integer(payload.away_team_id,1),payload.venue_id?integer(payload.venue_id,1):null,clean(payload.starts_at,40),status,id).run()}
      else if(resource==="calendar-events") await env.DB.prepare("UPDATE calendar_events SET title=?,event_type=?,starts_at=?,location_text=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(clean(payload.title,160),clean(payload.event_type,30),clean(payload.starts_at,40),clean(payload.location_text,200),id).run();
      else return json({error:"Unsupported resource"},422);
      await audit(env,admin,"edit",resource,id);return json({ok:true});
    }
    if (method === "POST" && segments[1] === "generate-fixtures") {
      if (!canWrite(admin)) return json({ error: "Insufficient permission" }, 403);
      const generated = await generateFixtures(await body(request), env, admin);
      return json({ ok:true, ...generated }, 201);
    }
    if (method === "POST" && segments[1] === "generate-cup") {
      if (!canWrite(admin)) return json({ error: "Insufficient permission" }, 403);
      return json({ok:true,...await generateCupRound(await body(request),env,admin)},201);
    }
    if(method==="GET"&&segments[1]==="scorecards"&&segments[2]){
      const fixtureId=integer(segments[2],1),card=await env.DB.prepare("SELECT * FROM match_scorecards WHERE fixture_id=?").bind(fixtureId).first();
      if(!card)return json({scorecard:null,games:[],players:[]});
      const [games,players]=await Promise.all([env.DB.prepare("SELECT * FROM match_games WHERE scorecard_id=? ORDER BY game_number").bind(card.id).all(),env.DB.prepare("SELECT * FROM match_player_stats WHERE scorecard_id=? ORDER BY id").bind(card.id).all()]);
      return json({scorecard:card,games:games.results,players:players.results});
    }
    if(method==="POST"&&segments[1]==="scorecards"){if(!canEnterResults(admin))return json({error:"Insufficient permission"},403);return json({ok:true,...await saveScorecard(await body(request),env,admin)},201)}
    if (method === "POST" && segments[1]) {
      if (!(segments[1]==="results"?canEnterResults(admin):canWrite(admin))) return json({ error: "Insufficient permission" }, 403);
      const payload = await body(request), id = await createRecord(segments[1],payload,env,admin);
      await audit(env,admin,"create",segments[1],id);
      return json({ ok:true,id },201);
    }
    if (method === "DELETE" && segments[1] && segments[2]) {
      if (!canAdminister(admin)) return json({ error: "Administrator permission required" }, 403);
      const resource = segments[1], id = integer(segments[2],1);
      if (resource === "teams") await env.DB.prepare("UPDATE teams SET active=0, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
      else if (resource === "venues") await env.DB.prepare("UPDATE venues SET active=0, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
      else if (resource === "players") await env.DB.prepare("UPDATE players SET registration_status='inactive', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
      else if (resource === "fixtures") await env.DB.prepare("DELETE FROM fixtures WHERE id=?").bind(id).run();
      else if (resource === "results") await env.DB.prepare("DELETE FROM results WHERE id=?").bind(id).run();
      else if (resource === "calendar-events") await env.DB.prepare("DELETE FROM calendar_events WHERE id=?").bind(id).run();
      else if (resource === "notices") await env.DB.prepare("DELETE FROM league_notices WHERE id=?").bind(id).run();
      else if (resource === "cup-ties") {
        const tie = await env.DB.prepare("SELECT fixture_id FROM cup_ties WHERE id=?").bind(id).first();
        if (!tie) return json({ error:"Cup game not found" },404);
        await env.DB.prepare("DELETE FROM cup_ties WHERE id=?").bind(id).run();
        if (tie.fixture_id) await env.DB.prepare("DELETE FROM fixtures WHERE id=?").bind(tie.fixture_id).run();
        await env.DB.prepare("UPDATE players SET appearances=COALESCE((SELECT SUM(appeared) FROM match_player_stats WHERE player_id=players.id),0),wins=COALESCE((SELECT SUM(singles_wins) FROM match_player_stats WHERE player_id=players.id),0),one_eighties=COALESCE((SELECT SUM(one_eighties) FROM match_player_stats WHERE player_id=players.id),0),highest_checkout=COALESCE((SELECT MAX(highest_checkout) FROM match_player_stats WHERE player_id=players.id),0),highest_shot_in=COALESCE((SELECT MAX(highest_shot_in) FROM match_player_stats WHERE player_id=players.id),0),updated_at=CURRENT_TIMESTAMP").run();
      }
      else return json({ error:"Unsupported resource" },422);
      await audit(env,admin,"delete",segments[1],segments[2]);
      return json({ok:true});
    }
    return json({ error: "Not found" }, 404);
  } catch (error) {
    console.error(error);
    const expected = ["Invalid number", "Invalid fixture generator settings", "This division already has fixtures. Remove them before generating a new season.", "Add at least two active teams to this division first.", "Complete every tie in the current cup round first.", "At least two teams are required for a cup round.", "A cup tie must have a winner after the beer leg.","Confirm that the signed scorecard has been received.","Fixture not found.","Select four players per team and complete all six match games.","Every game must have a valid winner.","Select the beer-leg winner.","Check the leg scores for every doubles and singles game.","A game winner does not match its leg score."];
    return json({ error: expected.includes(error.message) ? error.message : "Unable to complete the request" }, expected.includes(error.message) ? 422 : 500);
  }
}
