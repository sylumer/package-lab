// dominKnow (docs/packs/dominknow.md: no file names or keys known; detection is by name or text only).
import { score } from './util.js'

export default {
  id: 'dominknow', name: 'dominKnow',
  detect: (a, files) => score(files, [['name', /dominknow/i, 0.6], ['text', /dominknow/i, 0.6]]),
  staticRules({ analysis: a }) {
    return a.manifest ? [] : [{ sev: 'info', basis: 'pattern', title: 'there is no imsmanifest.xml',
      detail: 'dominKnow’s Publish panel offers a Web package (a ZIP for a web server) as well as LMS targets. Only the LMS targets with a SCORM standard make a manifest.',
      evidence: [], fix: 'In the Publish panel choose the LMS target, set Standard to SCORM 1.2 or SCORM 2004, and publish again. Its SCORM Cloud target can pre-test it.' }]
  },
  runRules() { return [] },
  notes: 'docs/packs/dominknow.md',
  sources: ['https://community.dominknow.com/showArticle/Publishing-your-Project-eaebc3b0', 'https://dominknow.com/publishing', 'https://rusticisoftware.com/resources/dominknow-scorm-cloud-case-study/'],
}
