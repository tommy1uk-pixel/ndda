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

const canWrite = admin => admin && ["administrator", "results_secretary"].includes(admin.role);
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

async function bootstrap(env) {
  const [applications, teams, players, fixtures, results, venues] = await Promise.all([
    env.DB.prepare("SELECT * FROM applications ORDER BY created_at DESC LIMIT 250").all(),
    env.DB.prepare("SELECT t.*, v.name AS venue_name, v.town AS venue_town FROM teams t LEFT JOIN venues v ON v.id=t.venue_id ORDER BY t.name").all(),
    env.DB.prepare("SELECT p.*, t.name AS team_name FROM players p LEFT JOIN teams t ON t.id=p.team_id ORDER BY p.name").all(),
    env.DB.prepare("SELECT f.*, ht.name AS home_team, at.name AS away_team, v.name AS venue_name FROM fixtures f JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id LEFT JOIN venues v ON v.id=f.venue_id ORDER BY f.starts_at DESC LIMIT 250").all(),
    env.DB.prepare("SELECT r.*, f.starts_at, ht.name AS home_team, at.name AS away_team FROM results r JOIN fixtures f ON f.id=r.fixture_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id ORDER BY f.starts_at DESC LIMIT 250").all(),
    env.DB.prepare("SELECT * FROM venues ORDER BY name").all(),
  ]);
  return { applications: applications.results, teams: teams.results, players: players.results, fixtures: fixtures.results, results: results.results, venues: venues.results };
}

async function publicLeague(env) {
  const [fixtures, results, players, teams] = await Promise.all([
    env.DB.prepare("SELECT f.id, f.starts_at, ht.name AS home_team, at.name AS away_team, ht.division, v.name AS venue_name, v.town FROM fixtures f JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id LEFT JOIN venues v ON v.id=f.venue_id WHERE f.status='scheduled' AND f.starts_at >= datetime('now') ORDER BY f.starts_at LIMIT 50").all(),
    env.DB.prepare("SELECT f.starts_at, ht.name AS home_team, at.name AS away_team, ht.division, r.home_score, r.away_score FROM results r JOIN fixtures f ON f.id=r.fixture_id JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id WHERE r.published=1 ORDER BY f.starts_at DESC LIMIT 100").all(),
    env.DB.prepare("SELECT p.name, t.name AS team_name, t.division, p.appearances, p.wins, p.one_eighties, p.highest_checkout FROM players p LEFT JOIN teams t ON t.id=p.team_id WHERE p.registration_status='registered' ORDER BY p.one_eighties DESC, p.highest_checkout DESC LIMIT 100").all(),
    env.DB.prepare("SELECT id, name, division FROM teams WHERE active=1 ORDER BY division, name").all(),
  ]);
  return { fixtures: fixtures.results, results: results.results, players: players.results, teams: teams.results };
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
    const result = await env.DB.prepare("INSERT INTO players (name, email, team_id, registration_status, appearances, wins, one_eighties, highest_checkout) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(clean(payload.name,120), clean(payload.email,254).toLowerCase(), payload.team_id ? integer(payload.team_id,1) : null, clean(payload.registration_status||"registered",20), integer(payload.appearances||0), integer(payload.wins||0), integer(payload.one_eighties||0), integer(payload.highest_checkout||0,0,170)).run();
    return result.meta.last_row_id;
  }
  if (resource === "fixtures") {
    const result = await env.DB.prepare("INSERT INTO fixtures (home_team_id, away_team_id, venue_id, starts_at, status) VALUES (?, ?, ?, ?, 'scheduled')")
      .bind(integer(payload.home_team_id,1), integer(payload.away_team_id,1), payload.venue_id ? integer(payload.venue_id,1) : null, clean(payload.starts_at,40)).run();
    return result.meta.last_row_id;
  }
  if (resource === "results") {
    const fixtureId = integer(payload.fixture_id,1);
    const result = await env.DB.prepare("INSERT INTO results (fixture_id, home_score, away_score, published, entered_by) VALUES (?, ?, ?, ?, ?) ON CONFLICT(fixture_id) DO UPDATE SET home_score=excluded.home_score, away_score=excluded.away_score, published=excluded.published, entered_by=excluded.entered_by, updated_at=CURRENT_TIMESTAMP")
      .bind(fixtureId, integer(payload.home_score), integer(payload.away_score), payload.published ? 1 : 0, admin.email).run();
    await env.DB.prepare("UPDATE fixtures SET status='completed', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(fixtureId).run();
    return result.meta.last_row_id || fixtureId;
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

export async function onRequest(context) {
  const { request, env, params } = context;
  const method = request.method.toUpperCase();
  const segments = Array.isArray(params.path)
    ? params.path.filter(Boolean)
    : String(params.path || "").split("/").filter(Boolean);
  try {
    if (method === "GET" && segments.join("/") === "public/league") return json(await publicLeague(env));
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
    if (method === "GET" && segments[1] === "bootstrap") return json({ user: admin, ...(await bootstrap(env)) });
    if (!sameOrigin(request)) return json({ error: "Invalid origin" }, 403);
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
    if (method === "POST" && segments[1] === "generate-fixtures") {
      if (!canWrite(admin)) return json({ error: "Insufficient permission" }, 403);
      const generated = await generateFixtures(await body(request), env, admin);
      return json({ ok:true, ...generated }, 201);
    }
    if (method === "POST" && segments[1]) {
      if (!canWrite(admin)) return json({ error: "Insufficient permission" }, 403);
      const payload = await body(request), id = await createRecord(segments[1],payload,env,admin);
      await audit(env,admin,"create",segments[1],id);
      return json({ ok:true,id },201);
    }
    if (method === "DELETE" && segments[1] && segments[2]) {
      if (!canAdminister(admin)) return json({ error: "Administrator permission required" }, 403);
      const allowed = { teams:"teams", players:"players", fixtures:"fixtures", results:"results", venues:"venues" };
      const table = allowed[segments[1]];
      if (!table) return json({ error:"Unsupported resource" },422);
      await env.DB.prepare(`DELETE FROM ${table} WHERE id=?`).bind(integer(segments[2],1)).run();
      await audit(env,admin,"delete",segments[1],segments[2]);
      return json({ok:true});
    }
    return json({ error: "Not found" }, 404);
  } catch (error) {
    console.error(error);
    const expected = ["Invalid number", "Invalid fixture generator settings", "This division already has fixtures. Remove them before generating a new season.", "Add at least two active teams to this division first."];
    return json({ error: expected.includes(error.message) ? error.message : "Unable to complete the request" }, expected.includes(error.message) ? 422 : 500);
  }
}
