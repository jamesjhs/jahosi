(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const input = $('message'), send = $('send'), thread = $('thread'), status = $('status');
  const key = window.DEEP_SPACE_SITE_KEY || '';
  let history = [], session = '', token = '', widget = null, busy = false;
  const welcome = thread.firstElementChild.cloneNode(true);
  function update() {
    input.disabled = busy;
    send.disabled = busy || !input.value.trim() || Boolean(key && !session && !token);
    $('reset').disabled = busy;
    $('gate').hidden = !key || Boolean(session);
    $('count').textContent = `${input.value.length} / 2000`;
  }
  function verificationLost(message) { token = ''; status.textContent = session ? 'Channel ready.' : message; update(); }
  function initTurnstile() {
    if (!key || widget !== null || !window.turnstile) return;
    widget = window.turnstile.render('#turnstile', {
      sitekey: key, theme: 'dark', size: 'flexible',
      callback: (value) => { token = value; status.textContent = 'Channel ready. Your transmission is welcome.'; update(); },
      'expired-callback': () => verificationLost('Verification expired. Please verify again.'),
      'error-callback': () => verificationLost('Verification could not load. Please retry or reload the page.'),
    });
  }
  window.deepSpaceInitTurnstile = initTurnstile;
  // The external script can finish before this deferred script is evaluated.
  initTurnstile();
  status.textContent = key ? 'Complete verification to open the command channel.' : 'Channel ready. Your transmission is welcome.';
  function addMessage(role, content) {
    const article = document.createElement('article');
    article.className = `message ${role === 'user' ? 'user' : 'commander'}`;
    const label = document.createElement('p'); label.className = 'speaker';
    label.textContent = role === 'user' ? 'YOU / OUTGOING TRANSMISSION' : 'COMMANDER / INCOMING TRANSMISSION';
    const body = document.createElement('p'); body.textContent = content;
    article.append(label, body); thread.append(article); thread.scrollTop = thread.scrollHeight;
    return article;
  }
  input.addEventListener('input', update);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault(); if (!send.disabled) $('chat-form').requestSubmit();
    }
  });
  $('reset').addEventListener('click', () => {
    history = []; input.value = ''; thread.replaceChildren(welcome.cloneNode(true));
    status.textContent = 'New conversation opened.'; update(); input.focus();
  });
  $('chat-form').addEventListener('submit', async (event) => {
    event.preventDefault(); if (send.disabled) return;
    const message = input.value.trim(); busy = true; update();
    const outgoing = addMessage('user', message);
    status.textContent = 'Awaiting the commander’s counsel…';
    thread.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch('/deepspace/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(55000),
        body: JSON.stringify({ message, history: history.slice(-8), chatSessionToken: session, turnstileToken: token }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 403) {
          session = ''; token = '';
          if (window.turnstile && widget !== null) window.turnstile.reset(widget);
        }
        const errors = {
          turnstile_required: 'Please complete verification again to reopen the channel.',
          turnstile_failed: 'Verification failed. Please complete the check again.',
          rate_limited: 'Transmission limit reached. Please try again in 15 minutes.',
          disabled: 'The command channel is currently offline. Please try again later.',
          invalid_message: 'Enter a transmission of up to 2000 characters.',
        };
        throw new Error(errors[data.error] || 'The command channel is unavailable. Please try again.');
      }
      if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('An empty transmission arrived. Please try again.');
      if (data.chatSessionToken) { session = data.chatSessionToken; token = ''; }
      history.push({ role: 'user', content: message }, { role: 'assistant', content: data.reply });
      history = history.slice(-8); addMessage('assistant', data.reply); input.value = '';
      status.textContent = 'Transmission received. Channel ready.';
    } catch (error) {
      outgoing.remove();
      status.textContent = error.name === 'TimeoutError' ? 'The transmission timed out. Please try again.' : error.name === 'TypeError' ? 'Connection lost. Check your connection and try again.' : error.message;
    } finally {
      busy = false; thread.setAttribute('aria-busy', 'false'); update(); input.focus();
    }
  });
  update();

  const canvas = $('stars'), context = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reducedMotion.matches, stars = [], frame = 0, last = 0, width = 0, height = 0;
  function resize() {
    width = window.innerWidth; height = window.innerHeight;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * scale; canvas.height = height * scale;
    if (!context) return;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    stars = Array.from({ length: Math.min(190, Math.round(width * height / 6500)) }, () => ({
      x: Math.random() * width, y: Math.random() * height, r: Math.random() * 1.2 + .25,
      alpha: Math.random() * .55 + .2, speed: Math.random() * .008 + .003,
    }));
    draw(0);
  }
  function draw(delta) {
    if (!context) return;
    context.clearRect(0, 0, width, height);
    for (const star of stars) {
      star.y = (star.y + delta * star.speed) % height;
      context.beginPath(); context.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      context.fillStyle = `rgba(203,221,255,${star.alpha})`; context.fill();
    }
  }
  function animate(now) {
    draw(last ? Math.min(now - last, 50) : 0); last = now;
    frame = requestAnimationFrame(animate);
  }
  function motion() {
    cancelAnimationFrame(frame); last = 0;
    $('motion').textContent = paused ? 'Resume starfield' : 'Pause starfield';
    $('motion').setAttribute('aria-pressed', String(paused));
    if (!paused && !document.hidden) frame = requestAnimationFrame(animate);
  }
  $('motion').addEventListener('click', () => { paused = !paused; motion(); });
  reducedMotion.addEventListener('change', () => { paused = reducedMotion.matches; motion(); });
  document.addEventListener('visibilitychange', motion);
  window.addEventListener('resize', resize);
  resize(); motion();
})();
