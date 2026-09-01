const menuButton = document.querySelector('.menu-button');
const nav = document.querySelector('#site-nav');
menuButton.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
});
nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
}));

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.filter').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  const division = button.dataset.division;
  document.querySelectorAll('.fixture-card').forEach(card => {
    card.classList.toggle('hidden', division !== 'all' && card.dataset.division !== division);
  });
}));

document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(item => item.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
  button.classList.add('active');
  document.querySelector(`#${button.dataset.tab}-panel`).classList.add('active');
}));

document.querySelectorAll('.interest').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.interest').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  document.querySelector('#interest-value').value = button.dataset.interest;
}));

document.querySelector('#join-form').addEventListener('submit', event => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const applications = JSON.parse(localStorage.getItem('nddl_applications') || '[]');
  applications.unshift({
    id: Date.now(),
    name: formData.get('name'),
    email: formData.get('email'),
    town: formData.get('town'),
    interest: formData.get('interest'),
    message: formData.get('message'),
    status: 'New',
    received: new Date().toISOString()
  });
  localStorage.setItem('nddl_applications', JSON.stringify(applications));
  event.currentTarget.querySelector('.form-success').classList.add('show');
  event.currentTarget.querySelector('button[type="submit"]').textContent = 'Interest registered ✓';
});
