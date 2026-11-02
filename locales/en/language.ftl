### The language select the popup's settings and the setup page share
### (static/popup.html, static/welcome.html, ui/language.ts): SignLens's
### own words and its explanations alike are in the language chosen. Each
### other choice is a language named in itself (English, 简体中文), not a
### message.

language-label = Language
# The first choice, the default: the languages the browser lists, as the browser's settings order them. $language: the language they give, named in itself (English, 简体中文).
language-browser = Your browser's languages ({ $language })
# Under the select.
language-note = For SignLens's own words and for its explanations.
# When the choice could not be saved. $error: why, in the browser's words.
language-not-saved = Not saved: { $error }
