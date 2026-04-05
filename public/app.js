let token = localStorage.getItem('token') || '';
let currentUser = null;
let currentSessionId = null;
let lastRunId = null;
let currentMode = 'summarize';

const $ = (id) => document.getElementById(id);

async function api(path, method = 'GET', body) {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw data;
  return data;
}

function renderOutput(result) {
  $('output').textContent = JSON.stringify(result, null, 2);
}

function showMain(show) {
  $('authCard').classList.toggle('hidden', show);
  $('mainCard').classList.toggle('hidden', !show);
}

async function loadMe() {
  const me = await api('/api/me');
  currentUser = me.user;
  $('usage').textContent = `Usage: ${me.usage.today}/${me.usage.limit}`;
}

async function ensureSession() {
  if (currentSessionId) return;
  const s = await api('/api/sessions', 'POST', { title: 'Daily text cleanup' });
  currentSessionId = s.id;
  await loadHistory();
}

async function loadHistory() {
  const { sessions } = await api('/api/sessions');
  const ul = $('history');
  ul.innerHTML = '';
  sessions.forEach((s) => {
    const li = document.createElement('li');
    li.textContent = `${s.title} (${new Date(s.updated_at).toLocaleString()})`;
    li.onclick = async () => {
      currentSessionId = s.id;
      const data = await api(`/api/sessions/${s.id}/runs`);
      if (data.runs[0]) {
        lastRunId = data.runs[0].id;
        renderOutput(data.runs[0].result_json);
      }
    };
    ul.appendChild(li);
  });
}

async function runWorkflow(isRerun = false) {
  await ensureSession();
  const inputText = $('inputText').value;
  const tone = $('tone').value;
  const data = await api('/api/ai/process', 'POST', {
    inputText,
    mode: currentMode,
    tone,
    sessionId: currentSessionId,
    rerunOf: isRerun ? lastRunId : null,
  });
  lastRunId = data.runId;
  $('usage').textContent = `Usage: ${data.usage.today}/${data.usage.limit}`;
  renderOutput(data.result);
  await loadHistory();
}

$('requestOtp').onclick = async () => {
  try {
    const d = await api('/api/auth/request-otp', 'POST', { email: $('email').value });
    $('otpHint').textContent = `Demo OTP: ${d.otpDemo}`;
  } catch (e) {
    alert(e.error || 'OTP request failed');
  }
};

$('verifyOtp').onclick = async () => {
  try {
    const d = await api('/api/auth/verify-otp', 'POST', {
      email: $('email').value,
      otp: $('otp').value,
    });
    token = d.token;
    localStorage.setItem('token', token);
    showMain(true);
    await loadMe();
    await ensureSession();
  } catch (e) {
    alert(e.error || 'Verification failed');
  }
};

$('newSession').onclick = async () => {
  currentSessionId = null;
  await ensureSession();
};

$('runAi').onclick = () => runWorkflow(false);
$('rerun').onclick = () => runWorkflow(true);

$('copyOut').onclick = async () => {
  await navigator.clipboard.writeText($('output').textContent || '');
};

$('exportTxt').onclick = () => {
  const blob = new Blob([$('output').textContent || ''], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'spidey-output.txt';
  a.click();
  URL.revokeObjectURL(a.href);
};

$('upgrade').onclick = async () => {
  try {
    await api('/api/billing/upgrade', 'POST');
    await loadMe();
    alert('Upgraded to paid tier.');
  } catch (e) {
    alert(e.error || 'Upgrade failed');
  }
};

$('thumbUp').onclick = async () => {
  if (!lastRunId) return;
  await api(`/api/runs/${lastRunId}/feedback`, 'POST', { vote: 'up' });
};

$('thumbDown').onclick = async () => {
  if (!lastRunId) return;
  await api(`/api/runs/${lastRunId}/feedback`, 'POST', { vote: 'down' });
};

$('viewAnalytics').onclick = async () => {
  const d = await api('/api/analytics/summary');
  $('analytics').textContent = JSON.stringify(d, null, 2);
};

document.querySelectorAll('.preset').forEach((btn) => {
  btn.onclick = () => {
    currentMode = btn.dataset.preset;
    document.querySelectorAll('.preset').forEach((b) => (b.style.outline = 'none'));
    btn.style.outline = '2px solid #5a8dff';
  };
});

$('themeToggle').onclick = () => {
  document.body.classList.toggle('light');
};

(async function bootstrap() {
  if (!token) return;
  try {
    showMain(true);
    await loadMe();
    await ensureSession();
  } catch {
    token = '';
    localStorage.removeItem('token');
    showMain(false);
  }
})();
