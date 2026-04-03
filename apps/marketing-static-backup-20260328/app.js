const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('[data-nav]');

if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
}

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.2 }
);

document.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el));

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const targetId = link.getAttribute('href');
    if (!targetId || targetId === '#') return;
    const target = document.querySelector(targetId);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (navLinks) navLinks.classList.remove('is-open');
  });
});

const year = document.getElementById('year');
if (year) {
  year.textContent = String(new Date().getFullYear());
}

const betaForm = document.getElementById('beta-form');
if (betaForm) {
  betaForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const success = betaForm.querySelector('.form-success');
    if (success) {
      success.textContent = 'Thanks! We will follow up shortly with beta access.';
    }
    betaForm.reset();
  });
}

const faqItems = document.querySelectorAll('.faq-item');
faqItems.forEach((item) => {
  item.addEventListener('toggle', () => {
    if (!item.open) return;
    faqItems.forEach((other) => {
      if (other !== item) other.removeAttribute('open');
    });
  });
});

const heroVisual = document.querySelector('.hero-visual');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (heroVisual && !prefersReducedMotion) {
  heroVisual.addEventListener('mousemove', (event) => {
    const rect = heroVisual.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    heroVisual.style.setProperty('--parallax-x', `${x * 16}px`);
    heroVisual.style.setProperty('--parallax-y', `${y * 16}px`);
  });

  heroVisual.addEventListener('mouseleave', () => {
    heroVisual.style.setProperty('--parallax-x', '0px');
    heroVisual.style.setProperty('--parallax-y', '0px');
  });
}
