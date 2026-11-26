import { projects } from './projects.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const list = document.getElementById('projectList');
const count = document.getElementById('projectCount');
const search = document.getElementById('projectSearch');
const empty = document.getElementById('projectEmpty');

function row(project, index) {
  const tags = (project.tags || []).map(tag => `<span>${esc(tag)}</span>`).join('');
  return `<a class="project-row" href="${esc(project.href || '#')}">
    <span class="project-index">${String(index + 1).padStart(2, '0')}</span>
    <span class="project-thumb"><img src="${esc(project.image || project.icon)}" width="720" height="450" alt="" loading="lazy"></span>
    <span class="project-copy">
      <span class="project-title"><b>${esc(project.name)}</b><em>${esc(project.subtitle || '')}</em></span>
      <span class="project-description">${esc(project.description || '')}</span>
      <span class="project-tags">${tags}</span>
    </span>
    <span class="project-meta"><span class="project-status">${esc(project.status || (project.comingSoon ? '后续' : '可用'))}</span><span>${esc(project.version || '')}</span><span class="project-arrow" aria-hidden="true">→</span></span>
  </a>`;
}

function render() {
  const query = (search?.value || '').trim().toLowerCase();
  const visible = projects.filter(project => !query || [project.name, project.subtitle, project.description, ...(project.tags || [])].join(' ').toLowerCase().includes(query));
  count.textContent = `${String(projects.length).padStart(2, '0')} 个项目`;
  list.innerHTML = visible.map((project, index) => row(project, projects.indexOf(project))).join('');
  if (empty) empty.hidden = visible.length > 0;
  list.querySelectorAll('.project-row').forEach((element, index) => {
    element.style.setProperty('--i', String(index));
  });
}

search?.addEventListener('input', render);
render();
