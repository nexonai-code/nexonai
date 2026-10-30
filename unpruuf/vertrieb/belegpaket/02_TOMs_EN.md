---
lang: en
label: TECHNICAL ANNEX
title: Technical and organisational measures
subtitle: unpruuf Compliance – GDPR Art. 32, split between software and organisation
date: 30.10.2026
version: 1.0
status: Template
conf: For the customer
---
# 1. How to use this list
The left column shows what unpruuf Compliance does by itself. The right column shows what your organisation adds, because the server and the case officer computer are yours. Copy the list into your records of processing (GDPR Art. 30) and complete the right column. This list is NexonAI's own description of the software; it has not been independently audited.

# 2. Confidentiality
| Measure | Provided by the software | Added by your organisation |
| Access to reports | Only the case officer app can decrypt reports. The server cannot read them. | Name the case officers in your internal procedure. Use a computer that only they use. |
| Identity of the reporter | No account, name, phone number or e-mail is collected. One QR code for the whole organisation. | Publish only the organisation QR code. Never hand out personal codes. |
| Physical access | Not applicable | Keep the server and the officer computer in a locked room or a contracted data centre. |
| Logical access to the server | Every request to the server needs a random access token. | Restrict administrator accounts, apply security updates. |
| Dashboard | Runs on the officer computer and is meant for that computer only. | Do not open the dashboard port to the network. Lock the screen when leaving. |

# 3. Pseudonymisation and encryption
| Measure | Provided by the software | Added by your organisation |
| In transit | End-to-end encryption between reporter and case officer; the app connects through Tor. | Tell reporters to use the app or Tor Browser rather than a normal browser. |
| On the server | Only encrypted packages, removed after at most 24 hours. | Nothing further needed. |
| On the officer computer | Case contents encrypted at rest with the officer password. | Turn on full-disk encryption (for example BitLocker). Store the password in a password manager. |
| Case numbers | Random case codes, never sequential. | Do not add names to case titles or notes unless the case requires it. |

# 4. Integrity
| Measure | Provided by the software | Added by your organisation |
| Message integrity | Authenticated encryption: changed packages are rejected. | Not applicable |
| Case history | Status changes and the conversation are kept with timestamps; deletions are written to a deletion log. | Define who may change case status. |

# 5. Availability and resilience
| Measure | Provided by the software | Added by your organisation |
| Intake | The reporting app retries for up to 14 days until the acknowledgement arrives. | Start the case officer app at least once a day. |
| Backups | Not built in. | Back up the officer computer's case database encrypted and test the restore. |
| Server | Runs as a small service; a replacement server can be started at any time. | Keep a documented way to restart or replace the server. |

# 6. Storage limitation and deletion
| Measure | Provided by the software | Added by your organisation |
| Server | Packages expire after at most 24 hours. | Nothing further needed. |
| Cases | Delete a single case permanently after confirming the case number; deletion log without content. | Set retention periods in your procedure and delete on time, including in backups and exported files. |
| Export | Export of one case as HTML or JSON. | Store exports only where your procedure allows. |

# 7. Testing and evaluation
| Measure | Provided by the software | Added by your organisation |
| Software testing | Automated tests of the case officer app; status: tested, not independently audited. An independent security test is planned. | Review this list once a year and after changes. |
| Incidents | Not applicable | Define how a suspected breach is reported (GDPR Art. 33, 34). |

Contact: unpruuf@nexonai.ro
