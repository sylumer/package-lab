// The lesson: four pages and a quiz. It bookmarks the page (cmi.core.lesson_location) and the answers so far
// (cmi.suspend_data), records each answer as an interaction, and sets the score and passed or failed against the
// mastery score from the manifest. Leaving before the quiz suspends the attempt, so the next launch resumes.
var pages = document.querySelectorAll('section'), page = 1, done = false
var answers = { q1: 'oxygen', q2: 'alarm', q3: 'no' }

function show(n) {
  page = n
  pages.forEach(function (s) { s.hidden = +s.dataset.page !== n })
  document.getElementById('where').textContent = 'Page ' + n + ' of ' + pages.length
  document.getElementById('back').disabled = n === 1
  document.getElementById('next').disabled = n === pages.length
  scorm.set('cmi.core.lesson_location', n)
  scorm.save()
}

function start() {
  var status = document.getElementById('status')
  if (!scorm.start()) { status.textContent = 'No LMS found: this page works, but nothing is tracked.'; show(1); return }
  var name = scorm.get('cmi.core.student_name'), entry = scorm.get('cmi.core.entry')
  status.textContent = 'Hello ' + (name || 'learner') + '. Entry: ' + (entry || '(blank)') +
    '. Status: ' + scorm.get('cmi.core.lesson_status') + '. Launch data: ' + (scorm.get('cmi.launch_data') || '(none)') + '.'
  if (scorm.get('cmi.core.lesson_status') === 'not attempted') scorm.set('cmi.core.lesson_status', 'incomplete')
  // Resume: back to the bookmarked page, with any answers already given.
  var saved = {}
  try { saved = JSON.parse(scorm.get('cmi.suspend_data') || '{}') } catch (e) {}
  Object.keys(saved).forEach(function (q) {
    var box = document.querySelector('input[name="' + q + '"][value="' + saved[q] + '"]')
    if (box) box.checked = true
  })
  show(entry === 'resume' && +scorm.get('cmi.core.lesson_location') ? +scorm.get('cmi.core.lesson_location') : 1)
}

function chosen() {
  var out = {}
  Object.keys(answers).forEach(function (q) { var c = document.querySelector('input[name="' + q + '"]:checked'); if (c) out[q] = c.value })
  return out
}

document.getElementById('back').onclick = function () { show(page - 1) }
document.getElementById('next').onclick = function () { show(page + 1) }
document.getElementById('exit').onclick = function () { scorm.finish(done ? '' : 'suspend'); document.getElementById('status').textContent = 'Saved. You can close this page.' }
document.getElementById('quiz').onchange = function () { scorm.set('cmi.suspend_data', JSON.stringify(chosen())); scorm.save() }
document.getElementById('quiz').onsubmit = function (e) {
  e.preventDefault()
  var given = chosen(), right = 0, n = 0
  Object.keys(answers).forEach(function (q) {
    var ok = given[q] === answers[q]
    if (ok) right++
    scorm.set('cmi.interactions.' + n + '.id', q)
    scorm.set('cmi.interactions.' + n + '.type', 'choice')
    scorm.set('cmi.interactions.' + n + '.student_response', given[q] || '')
    scorm.set('cmi.interactions.' + n + '.correct_responses.0.pattern', answers[q])
    scorm.set('cmi.interactions.' + n + '.result', ok ? 'correct' : 'wrong')
    n++
  })
  var score = Math.round(right * 100 / n), mastery = +scorm.get('cmi.student_data.mastery_score') || 80, passed = score >= mastery
  scorm.set('cmi.core.score.min', 0)
  scorm.set('cmi.core.score.max', 100)
  scorm.set('cmi.core.score.raw', score)
  scorm.set('cmi.core.lesson_status', passed ? 'passed' : 'failed')
  scorm.save()
  done = true
  document.getElementById('result').textContent = 'You scored ' + score + '%: ' + (passed ? 'passed' : 'not passed, the pass mark is ' + mastery + '%') + '. Choose Save and exit to finish.'
}
// Closing the page without Save and exit still ends the session, as suspended if the quiz isn't done.
addEventListener('pagehide', function () { scorm.finish(done ? '' : 'suspend') })
start()
