(() => {
  const root = document.querySelector('#ann-workbench');
  const labels = ['Object relocation', 'Pick & place', 'Tool use'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let cases, current, videos = [], playing = false, generation = 0, active = -2, raf, speed = 1;
  const q = selector => root.querySelector(selector);
  const qa = selector => [...root.querySelectorAll(selector)];
  const duration = () => current.end_frame / current.fps;
  const actionName = a => a.actions.join(' + ').replaceAll('_', ' ');
  function pause() {
    playing = false;
    videos.forEach(v => v.pause());
    const b = q('.ann-play'); if (b) { b.textContent = 'Play'; b.setAttribute('aria-label', 'Play all three views'); }
  }
  function seek(time) {
    time = Math.max(0, Math.min(time, duration() - 0.001));
    videos.forEach(v => { v.dataset.seek = time; if (v.readyState >= 1) v.currentTime = Math.min(time, v.duration || time); });
    update(time);
  }
  async function play() {
    if (playing) { pause(); return; }
    if (videos[0].currentTime >= duration() - 0.1) seek(0);
    const token = generation, localVideos = [...videos];
    playing = true;
    q('.ann-play').textContent = 'Pause'; q('.ann-play').setAttribute('aria-label', 'Pause all three views');
    try { await Promise.all(localVideos.map(v => v.play())); }
    catch (_) { if (token === generation) { pause(); q('.ann-hint').textContent = 'Playback could not start. Press Play to retry, or select a motion to inspect it.'; } }
    if (token !== generation || !playing) localVideos.forEach(v => v.pause());
  }
  function flag(label, value, isFailure = false) {
    return `<div><dt>${label}</dt><dd class="${value ? 'ann-good' : isFailure ? 'ann-bad' : ''}">${value ? 'Yes' : 'No'}</dd></div>`;
  }
  function update(time) {
    q('.ann-seek').value = time;
    q('.ann-clock').textContent = `${time.toFixed(1)} / ${duration().toFixed(1)}s`;
    qa('.ann-playhead').forEach(e => e.style.left = `${Math.min(100, time / duration() * 100)}%`);
    const frame = Math.min(current.end_frame - 1, Math.floor(time * current.fps + 0.001));
    const index = current.annotations.findIndex(a => frame >= a.start_frame && frame < a.end_frame);
    if (index === active) return;
    active = index;
    const a = current.annotations[index];
    qa('[data-atomic]').forEach(b => { const selected = Number(b.dataset.atomic) === index; b.classList.toggle('ann-active', selected); b.setAttribute('aria-pressed', String(selected)); });
    qa('[data-macro]').forEach(b => b.classList.toggle('ann-linked', !!a?.source_ids.includes(Number(b.dataset.macro))));
    q('.ann-evidence').innerHTML = a ? `<div class="ann-evidence-title">LINKED ROBOT MOTION <span>ΔZ · gripper openness</span></div>${current.macro.filter(m=>a.source_ids.includes(m.index)).map(m=>`<div class="ann-evidence-row"><span>Segment ${String(m.index+1).padStart(2,'0')}</span><span>${m.delta_z_cm > 0 ? '+' : ''}${m.delta_z_cm} cm</span><span>${Math.round(m.gripper_start*100)}% → ${Math.round(m.gripper_end*100)}%</span></div>`).join('')}` : '';
    const jump = current.annotations.findIndex(a => !a.execution_success);
    const jumpButton = jump >= 0 ? `<button class="ann-jump" data-jump="${jump}">Inspect the failed grasp ↗</button>` : '';
    q('.ann-detail').innerHTML = a ? `
      <div class="ann-detail-kicker"><span>ATOMIC MOTION ${String(index + 1).padStart(2,'0')}</span><span>${(a.start_frame/current.fps).toFixed(1)}–${(a.end_frame/current.fps).toFixed(1)}s</span></div>
      <p class="ann-description">${esc(a.subtask)}</p>
      <p class="ann-object">Object · ${esc(a.object)}</p>
      <dl class="ann-flags">${flag('Task-relevant object',a.obj_relate_to_task)}${flag('Execution success',a.execution_success,true)}${flag('Task complete',a.task_completion)}</dl>
      ${a.observed_result ? `<p class="ann-observed"><b>Observed outcome</b>${esc(a.observed_result)}</p>` : ''}${jumpButton}` : `<div class="ann-detail-kicker">BEFORE THE FIRST LABEL</div><p class="ann-description">The first annotated motion begins at ${(current.annotations[0].start_frame/current.fps).toFixed(1)}s.</p><p class="ann-object">The source leaves these initial frames unlabeled.</p>${jumpButton}`;
  }
  function tick() {
    if (videos.length && videos[0].readyState >= 1) {
      const t = videos[0].currentTime;
      if (playing) {
        videos.slice(1).forEach(v => { if (v.readyState >= 2 && Math.abs(v.currentTime-t) > 0.09) v.currentTime = t; });
        update(t);
        if (videos[0].ended || t >= duration() - 0.02) pause();
      }
    }
    raf = requestAnimationFrame(tick);
  }
  function selectCase(index) {
    pause(); generation++; active = -2;
    videos.forEach(v => { v.removeAttribute('src'); v.load(); });
    current = cases[index];
    const rangeStyle = a => `left:${a.start_frame/current.end_frame*100}%;width:${(a.end_frame-a.start_frame)/current.end_frame*100}%`;
    root.innerHTML = `<div class="ann-tabs" role="group" aria-label="Annotated demonstrations">${cases.map((c,i) => `<button data-case="${i}" aria-selected="${i===index}" aria-pressed="${i===index}">${labels[i]}</button>`).join('')}</div>
      <div class="ann-titlebar"><div><h3>${esc(current.title)}</h3><div class="ann-meta">DROID / ${current.id} · ${current.annotations.length} atomic motions · ${duration().toFixed(1)}s</div></div><span class="ann-check">✓ Checker passed</span></div>
      <div class="ann-views">${[['wrist','Wrist'],['left','Left view'],['right','Right view']].map(([key,label]) => `<figure class="ann-view"><video muted playsinline preload="auto" src="${esc(current.videos[key])}" aria-label="${label}: ${esc(current.title)}"></video><figcaption>${label}</figcaption></figure>`).join('')}</div>
      <div class="ann-layout"><div class="ann-player"><div class="ann-controls"><button class="ann-play" aria-label="Play all three views">Play</button><input class="ann-seek" type="range" min="0" max="${duration()}" step="0.01" value="0" aria-label="Seek all three camera views"><span class="ann-clock"></span><select class="ann-speed" aria-label="Playback speed"><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select></div>
      <div class="ann-timeline-row"><span class="ann-timeline-label">Physical<br>segments</span><div class="ann-track">${current.macro.map(a=>`<button data-macro="${a.index}" style="${rangeStyle(a)}" title="Segment ${a.index+1} · ΔZ ${a.delta_z_cm} cm · Gripper ${a.gripper_start} → ${a.gripper_end}" aria-label="Physical segment ${a.index+1}: height change ${a.delta_z_cm} cm, gripper openness ${a.gripper_start} to ${a.gripper_end}">${a.index+1}</button>`).join('')}<span class="ann-playhead"></span></div></div>
      <div class="ann-timeline-row"><span class="ann-timeline-label">Atomic<br>motions</span><div class="ann-track ann-atomic">${current.annotations.map((a,i)=>`<button data-atomic="${i}" class="${a.execution_success ? '' : 'ann-failed'}" style="${rangeStyle(a)}" title="${esc(a.subtask)}" aria-label="Motion ${i+1}: ${esc(a.subtask)}">${i+1}</button>`).join('')}<span class="ann-playhead"></span></div></div>
      <div class="ann-legend"><span></span> Successful execution <span></span> Failed execution</div><div class="ann-evidence"></div></div><aside class="ann-detail" aria-label="Current atomic-motion annotation"></aside></div>
      <div class="ann-segments" role="group" aria-label="Select an atomic motion">${current.annotations.map((a,i)=>`<button data-atomic="${i}" class="${a.execution_success ? '' : 'ann-failed'}" aria-pressed="false">${String(i+1).padStart(2,'0')} · ${esc(actionName(a))}${a.execution_success?'':' ×'}</button>`).join('')}</div>`;
    videos = qa('video');
    const token = generation;
    videos.forEach(v => {
      v.muted = true; v.playbackRate = speed;
      v.addEventListener('loadedmetadata', () => { if (token === generation) v.currentTime = Number(v.dataset.seek || 0); });
      v.addEventListener('error', () => { if (token === generation) { pause(); q('.ann-hint').textContent = 'A video could not be loaded. Reload this page to retry.'; } });
    });
    q('.ann-speed').value = String(speed);
    update(0);
  }
  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.case !== undefined) selectCase(Number(b.dataset.case));
    else if (b.matches('.ann-play')) play();
    else if (b.dataset.atomic !== undefined || b.dataset.jump !== undefined) { pause(); seek(current.annotations[Number(b.dataset.atomic ?? b.dataset.jump)].start_frame/current.fps); }
    else if (b.dataset.macro !== undefined) { pause(); seek(current.macro.find(m=>m.index===Number(b.dataset.macro)).start_frame/current.fps); }
  });
  root.addEventListener('input', e => { if (e.target.matches('.ann-seek')) seek(Number(e.target.value)); });
  root.addEventListener('change', e => { if (e.target.matches('.ann-speed')) { speed = Number(e.target.value); videos.forEach(v=>v.playbackRate=speed); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('pagehide', () => { pause(); cancelAnimationFrame(raf); });
  fetch('assets/annotation/data.json').then(r=>{ if(!r.ok) throw Error(r.status); return r.json(); }).then(data=>{cases=[data.cases[2],data.cases[0],data.cases[1]];selectCase(0);tick();}).catch(()=>{root.innerHTML='<p class="ann-error">The annotation examples could not be loaded. Please reload this page.</p>';});
})();
