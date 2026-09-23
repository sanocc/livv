const navLinks=document.querySelectorAll('.nav-links a');
const sections=[...document.querySelectorAll('main section[id]')];
const menu=document.querySelector('.menu-btn');
menu?.addEventListener('click',()=>document.querySelector('.nav-links').classList.toggle('open'));
document.querySelectorAll('a[href^="#"]').forEach(link=>link.addEventListener('click',()=>document.querySelector('.nav-links')?.classList.remove('open')));
const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){navLinks.forEach(link=>link.classList.toggle('active',link.getAttribute('href')==='#'+entry.target.id))}}),{rootMargin:'-35% 0px -55% 0px'});
sections.forEach(section=>observer.observe(section));
const dashBars=document.querySelector('.dash-bars');
if(dashBars){dashBars.innerHTML=[[30,'0-100'],[53,'100-200'],[83,'200-300'],[65,'300-400'],[42,'400-500'],[19,'500+']].map(([height,label])=>`<i style="height:${height}%"><small>${label}</small></i>`).join('')}
