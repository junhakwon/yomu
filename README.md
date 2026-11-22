# Yomu 読む

A small Japanese reading and listening app (installable PWA) for an advanced learner.

- Home: the latest video from an official TV news channel (日テレNEWS / TBS NEWS DIG / ANNnewsCH) and today's NHK News Web headlines.
- Read: public-domain literature from 青空文庫 with tap-a-word readings and meanings, furigana toggle, vertical writing, saved words.
- Listen: comedy videos of 20 minutes or more from official comedians' channels, opened in the YouTube app.
- Words: saved words with spaced review.

`feeds.json` is refreshed every 3 hours by a GitHub Action (`update.js`): it stores only titles, links and video lengths.

Credits: texts from 青空文庫 (Aozora Bunko, public domain). Dictionary: JMdict, © Electronic Dictionary Research and
Development Group, used under CC BY-SA 4.0 (https://www.edrdg.org/edrdg/licence.html); dict.json is a derived subset under
the same licence. Readings from Aozora ruby and kuromoji (IPADIC).
