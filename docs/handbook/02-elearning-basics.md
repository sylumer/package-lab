# 2. E-learning in ten minutes

**What you'll learn:** what a package is, how a course and an LMS talk to each other, and the handful of ideas from
browsers that explain most failures. If you already know SCORM well, skim the headings and move on.

## The package

A course is a small website: HTML pages, JavaScript, stylesheets, images, video. A **package** is that website in a
ZIP file, with a description of itself that an LMS can read.

For SCORM, the description is a file called `imsmanifest.xml`, at the top level of the ZIP. It says:

- which version of SCORM the course uses;
- the course's structure: its **items**, as a tree, each with a title;
- the **resources**: for each item, the page to launch (its `href`) and the files it needs.

An item that tracks the learner is a **SCO** (sharable content object). An item that is only a page to look at, such
as a glossary, is an **asset**. A package often has one SCO; some have many.

Here is the core of the sample course you'll practise on, cut down (the namespace declarations and the second item
are left out, so this extract isn't valid XML on its own):

```xml
<manifest identifier="com.thoughtasylum.toolbox.sample.scorm12" version="1">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="org">
    <organization identifier="org">
      <title>Fire Safety Basics (sample)</title>
      <item identifier="lesson" identifierref="lesson_res">
        <title>Lesson and quiz</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="lesson_res" adlcp:scormtype="sco" href="lesson.html">
      <file href="lesson.html"/>
      <file href="scorm.js"/>
    </resource>
  </resources>
</manifest>
```

The LMS reads this, finds the item *Lesson and quiz*, and launches `lesson.html`.

Three things about the manifest break courses more than anything else, and Package Lab checks all of them as soon as
you open a package:

- It must be called exactly `imsmanifest.xml`, in lower case, at the top of the ZIP (not inside a folder).
- Every file it names must be in the ZIP with exactly the same capitals.
- The SCORM version it declares must match the one the course's scripts actually use.

## The LMS and the API

When a learner launches a SCO, the LMS opens the launch page in the browser, usually inside a frame of its own page.
The course and the LMS then talk through a JavaScript object called the **API**, which the LMS puts on one of its
windows.

The course has to find it. It looks at its own window, then its parent frame, then the parent's parent, and so on up
to the top, and sometimes at the window that opened it. The API has a different name in each version:

| | SCORM 1.2 | SCORM 2004 |
|---|---|---|
| The object | `window.API` | `window.API_1484_11` |
| Start the session | `LMSInitialize("")` | `Initialize("")` |
| Read a value | `LMSGetValue(name)` | `GetValue(name)` |
| Write a value | `LMSSetValue(name, value)` | `SetValue(name, value)` |
| Save | `LMSCommit("")` | `Commit("")` |
| End the session | `LMSFinish("")` | `Terminate("")` |
| What went wrong | `LMSGetLastError()` | `GetLastError()` |

Every call returns text: `"true"` or `"false"` for the actions, the value for a read. After a `"false"`, the error call
returns a number that says why.

This explains a whole class of failures. A course that looks for `API` when the LMS only offers `API_1484_11` finds
nothing. A course that searches three frames up, in an LMS that put the API four frames up, finds nothing. A course
that never looks at all never talks to the LMS. Package Lab records every one of those lookups.

## The data model

What the course reads and writes are named values, the **data model**. Their names start with `cmi.`. The ones you will
see most:

| Meaning | SCORM 1.2 | SCORM 2004 |
|---|---|---|
| Is this a fresh start or a return? | `cmi.core.entry` (`ab-initio` or `resume`) | `cmi.entry` |
| The bookmark: where the learner was | `cmi.core.lesson_location` | `cmi.location` |
| The course's own saved state (answers, progress) | `cmi.suspend_data` | `cmi.suspend_data` |
| Status | `cmi.core.lesson_status` (`passed`, `failed`, `completed`, `incomplete`…) | `cmi.completion_status` and `cmi.success_status` |
| Score | `cmi.core.score.raw` | `cmi.score.raw`, `cmi.score.scaled` |
| How the learner left | `cmi.core.exit` (`suspend`, or empty) | `cmi.exit` |
| The learner's name | `cmi.core.student_name` | `cmi.learner_name` |

**Suspend data** has a size limit: 4,096 characters in SCORM 1.2 and 64,000 in SCORM 2004, and some LMSs set their own.

## A healthy session

Put together, a course that works does this:

1. The LMS opens the launch page. The page loads its scripts and shows something.
2. The course looks for the API and finds it.
3. It calls `LMSInitialize` (or `Initialize`).
4. It reads `entry`, and if it is `resume`, reads the bookmark and suspend data and goes back to where the learner was.
5. As the learner moves, it writes the bookmark, suspend data, status and score, and commits now and then.
6. When the learner leaves, it sets `exit` to `suspend` if they haven't finished, commits, and calls `LMSFinish`.

Package Lab splits these six steps into ten **milestones**. [Chapter 5](05-first-run.md) shows them on a real run.

## Three ideas from browsers

Most courses that fail in an LMS but work on the author's computer fail for one of these reasons.

**Paths and capitals.** A file in the package is found by its path, relative to the page that asks for it. On a Mac
or Windows, `js/App.js` and `js/app.js` are the same file. On the Linux servers most LMSs run on, they are different, and
the wrong one is “not found”. A path that starts with `/` (like `/api/config`) means the top of the *server*, not the
package, so it only works on the server the course was built for.

**Frames and origins.** An LMS shows the course inside a **frame** (a page within a page), sometimes several deep, or
in a new window. The course can reach the LMS's windows only if both come from the same **origin**: the same scheme,
host and port, such as `https://lms.example.com`. Many LMSs serve course files from a different host, a content
server or CDN. Then the browser stops the course reaching the LMS's API at all, unless the LMS provides a bridge.

**Storage and privacy.** Browsers let a page keep data of its own: cookies, `localStorage`, `sessionStorage`,
IndexedDB. Safari, and Chrome in some settings, refuse that storage to a page shown inside another site's frame, which
is exactly where a course sits in an LMS. A course that keeps its state there, rather than in `cmi.suspend_data`, can
fail to start or forget everything in Safari or on an iPad.

## cmi5 and xAPI, briefly

SCORM is old and widely used. Its successors are built on **xAPI** (also called Tin Can), where the course doesn't
call an API object in the page. It sends **statements** (“Learner, Test *completed* Fire Safety”) over the web to a
**learning record store** (LRS).

- A **Tin Can package** has a `tincan.xml` instead of a manifest.
- A **cmi5 package** has a `cmi5.xml`. cmi5 adds rules on top of xAPI for how an LMS launches the course and what
  statements it must send, in what order.

Package Lab handles both, with its own LRS that checks every statement. Most of this handbook uses SCORM, because that
is what most courses are. [Chapter 15](15-thinking-like-an-analyst.md#cmi5-and-xapi-courses) covers what changes.

## Check yourself

1. A package's manifest is at `course/imsmanifest.xml` inside the ZIP. Will it work?
2. A SCORM 2004 course calls `LMSInitialize`. What will it find, and why?
3. Which data model values does a course need to read to resume where the learner left off?
4. The course loads `/scripts/player.js`. Why might that work on the authoring tool's website but not in an LMS?
5. Why might a course that keeps its progress in `localStorage` fail on an iPad?

Next: [Install, and build your practice kit](03-install-and-practice-kit.md).
