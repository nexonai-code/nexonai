---
lang: en
label: TECHNICAL ANNEX
title: unpruuf Compliance
subtitle: Technical overview and data map for data protection officers and IT
date: 30.10.2026
version: 1.0
status: Tested, not audited
conf: For the customer
---
# 1. What this document is
This annex describes what unpruuf Compliance stores, where it stores it and who can reach it. It states engineering facts about the software. It is not a legal opinion and not a certification. unpruuf Compliance is tested and works; it has not been independently audited and is not certified. Whether these facts meet your organisation's obligations under the GDPR and Law 361/2022 is confirmed by your data protection officer or a lawyer.

> **Prerequisite.** Your organisation operates its own server for the reporting channel. NexonAI operates no servers and has no access to your system, your reports or your case files.

# 2. Components
| Component | Where it runs | Who operates it |
| Reporting app | The reporter's Android phone (free app) | The reporter |
| Web reporter | Any browser, for people without the app | The reporter |
| Your server | Your organisation's computer, data centre or hosting provider | Your organisation |
| Case officer app | A Windows computer of the case officer | Your organisation |

# 3. Data map
| Place | What is there | How long |
| Your server | Encrypted packages only. No names, no IP addresses, no case content in readable form. | At most 24 hours, then removed |
| Reporter's phone | The reporter's own messages and case code, stored locally | Until the reporter deletes them |
| Case officer computer | Case files, encrypted at rest with the officer password | Until your organisation deletes the case |
| Licence | Offline licence code, no licence server | No contact with NexonAI |
| NexonAI | Nothing | Not applicable |

# 4. What the system does not collect
- No user account, no name, no phone number, no e-mail address of the reporter.
- No tracking, analytics or crash reporting in the apps; nothing is sent to NexonAI or third parties.
- No licence server: NexonAI does not learn when or how often the system is used.
- One QR code for the whole organisation, never one code per employee, so a code cannot be tied to a person.

# 5. How a report travels
1. The reporter scans the organisation's QR code in the app or opens the web reporter.
2. The report is encrypted on the reporter's device before it leaves it.
3. It is placed on your organisation's server, which cannot read it.
4. The case officer app picks it up from your server and decrypts it on the officer's computer.
5. The reporter receives an acknowledgement with a random case code (for example HW-7Q4M-2X9D, never a sequential number).
6. Questions and answers continue in the same encrypted conversation, linked only to the case code.

# 6. Deadlines
The case officer app tracks the deadlines of Directive (EU) 2019/1937 Art. 9: acknowledgement of receipt within 7 days and feedback within 3 months. The overview sorts open cases by the next deadline and colours them red, amber or green.

# 7. Deleting and exporting a case
- **Delete one case.** The case officer deletes a single case permanently after typing its case number to confirm. The app keeps a deletion log with only the case number and the date and time of deletion, no content, so the organisation can show that and when it deleted.
- **Export one case.** A case can be exported as a printable HTML file or as a JSON file, for example for an authority or for the organisation's own records. The export contains the case number, category, dates, deadlines, status changes and the full conversation.
- Copies made outside the app (backups of the officer computer, printed or exported files) are under the organisation's own retention rules and must be deleted by the organisation as well.

# 8. Known limits
- **Web reporter.** The browser version does not use Tor. A reporter writing from a normal browser shows their IP address to your server. The web reporter says so on its first screen. The app does not have this limit.
- **Officer computer.** Anyone who controls the officer's computer while it is unlocked can read the cases. Case contents are encrypted at rest; the existence of cases and their dates are not.
- **Dashboard access.** The case dashboard runs on the officer's computer and is meant to be opened only there. It must not be exposed to the network.
- **Password.** There is no password recovery. A lost officer password means the case files cannot be opened.
- **Availability.** The case officer app should run at least once a day, because packages wait on your server for at most 24 hours.

# 9. Roles under the GDPR
- Your organisation is the controller (GDPR Art. 4(7)).
- NexonAI supplies the software and normally is not a processor (GDPR Art. 28), because it has no access to the data. If NexonAI is given access, for example for installation or support on your systems, a data processing agreement is concluded first. A template is part of this package.
- The architecture supports the principles of data minimisation, storage limitation and confidentiality (GDPR Art. 5, 25, 32). Your data protection officer or lawyer confirms the classification for your organisation.

Contact: unpruuf@nexonai.ro
