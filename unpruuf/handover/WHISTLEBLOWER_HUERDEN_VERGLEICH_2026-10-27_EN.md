# Barriers to Using Internal Reporting Channels: The Empirical Top 5 and the Architecture of unpruuf Compliance in System Comparison

The legal obligation to set up internal reporting channels, following the European Whistleblower Directive (EU 2019/1937) and national laws such as the German Whistleblower Protection Act (Hinweisgeberschutzgesetz, HinSchG), has made whistleblowing systems a standard part of modern compliance organisations with 50 or more employees. Despite this regulatory reach, empirical surveys by renowned institutions, including the studies of the University of Applied Sciences of the Grisons (FH Graubünden) and the EQS Group, the benchmark analyses of NAVEX Global and the surveys of the Ethics & Compliance Initiative (ECI), show that actual use of the systems falls far short of expectations.

Although serious misconduct such as corruption, discrimination, accounting fraud or data protection violations is observed in up to 40 percent of the organisations examined, a considerable part of the workforce remains silent. This restraint is not due to lack of interest but to fundamental psychological, procedural and technological barriers.

The following analysis summarises the five empirically dominant barriers on the employee side and sets against them the solution architecture of unpruuf Compliance: the reporting channel unpruuf Compliance (an app for reporting persons, a dashboard for the responsible person) and, in addition, unpruuf Business for confidential internal communication. Both run on the same system. **Status: pilot phase, not yet independently audited.** The statements about unpruuf describe what the architecture does and what supports it; they are neither legal advice nor a certification.

## The Empirical Top 5 Barriers to Using Whistleblowing Systems

From the evaluation of international governance literature and quantitative surveys, five main clusters of causes can be derived that largely determine the reporting behaviour of employees.

### 1. Fear of professional and personal retaliation

Fear of retaliation is by far the most frequently documented barrier for potential whistleblowers. The Global Business Ethics Survey (GBES) of the Ethics & Compliance Initiative shows that, globally, 40 to 46 percent of employees who reported misconduct subsequently suffered concrete retaliation. In medium-sized companies, individual surveys even registered retaliation rates of up to 90 percent. Retaliation rarely appears solely as formal dismissal; it appears mainly as covert disadvantage, such as refused promotions, assignment of inferior tasks, deliberate social coldness or increased criticism from superiors.

This risk is aggravated by a pronounced institutional deficit of proof. The NAVEX Whistleblowing & Incident Management Benchmark Report documents that reports of retaliation suffered reach a substantiation rate of only 16 to 18 percent. While substantive legal violations overall are confirmed in around 46 percent of internal investigations, subtle retaliation at work is hardly demonstrable with conclusive evidence for those affected. This discrepancy signals to employees a high personal risk with minimal prospect of organisational protection.

### 2. Doubts about technical anonymity and digital traceability

The second central obstacle is deep mistrust of the technical assurances of the employer's side. A growing number of organisations offer formal anonymity, but many employees doubt that a digital reporting process really remains free of traceability. The Whistleblowing Report 2025 of FH Graubünden and the EQS Group shows that 76 to 79 percent of companies in Germany and Switzerland still rely on traditional channels such as e-mail, and 59 to 64 percent on the telephone, media that by their nature reveal identifying features such as IP addresses, sender headers or voice profiles.

With web-based portals, too, employees fear tracking through device fingerprinting, server log files, network monitoring or central interfaces to identity management systems (such as Microsoft Active Directory). If the reporting platform is also hosted with external cloud providers, employees fear uncontrollable data forwarding or access by in-house IT administrators. If a system offers no architecturally demonstrable anonymity, employees retreat into silence to protect themselves.

### 3. Perceived powerlessness and futility

Besides the fear of sanctions, the perceived pointlessness of a report acts as a strong demotivator. The ECI names the lack of belief that management will take actual corrective action ("belief that no corrective action will be taken") as one of the main reasons for not reporting violations. Employees often suspect that reporting systems are mere compliance alibis that relieve the management level but bring no real consequences for perpetrators, especially managers.

This futility is fed by operational opacity. If reporting channels are designed as digital one-way streets, where the whistleblower is informed neither about the status nor about the opening of investigations after sending the report, an impression of indifference arises. In addition, the NAVEX analyses show that the median processing time until case closure ("case closure time") has risen to 28 days. If weeks pass without substantive feedback, reporting persons become convinced that their initiative is being ignored or deliberately sat out.

### 4. Administrative access barriers, account requirements and process complexity

Although, according to the NAVEX benchmark data, web-based reporting portals have now overtaken classic telephone hotlines (33.4 percent against 29.4 percent of all submissions), many digital interfaces are administratively overloaded. A considerable barrier is the obligation to create user profiles, to provide e-mail addresses for verification links or to manage complex passwords. Every required prior identification drastically increases the drop-out rate.

In addition there is widespread uncertainty about the legal framework: many employees simply do not know which behaviour can be reported, which body examines the cases or which protection rights the Whistleblower Protection Act offers. If the process involves cognitive hurdles, unclear responsibility or software installation requirements, the report is not made.

### 5. Social pressure to conform, loyalty conflicts and stigmatisation

Whistleblowing regularly collides with informal group structures and learned loyalties. The ECI data show that about every third observed misconduct goes unreported because employees shy away from breaking team loyalty. In many workplace cultures, whistleblowers still carry the discriminatory label of "informer".

Potential whistleblowers fall into a severe role conflict between duty towards the company and the code of conduct of their colleagues. The fear of collective exclusion, bullying at work or destruction of the professional network outweighs, in many cases, the abstract interest in lawful conduct. Where a system is missing that cushions this social pressure through strict discretion and low-threshold communication, the majority of employees choose conformity.

## Empirical Overview of the Barriers to Using Whistleblowing Systems

| Rank | Barrier | Empirical findings and figures | Psychological cause on the employee side | Consequence for the organisation |
|---|---|---|---|---|
| 1 | Fear of retaliation | 40–46 % retaliation rate after reporting (ECI); only 16–18 % substantiation rate for retaliation allegations (NAVEX). | Fear of dismissal, career blockades, transfer and subtle bullying. | Acute risks escalate internally unchecked until they become known to the authorities. |
| 2 | Doubts about anonymity | 64 % of reporting offices offer anonymity; 76–79 % use insecure e-mail channels (EQS / FH Graubünden). | Mistrust of central IT infrastructure, IP logging and cloud hosts. | Employees refuse to use the systems for lack of technical proof of protection. |
| 3 | Powerlessness (futility) | Main reason for silence according to ECI; median procedure duration rises to 28 days (NAVEX). | Conviction that reports remain without consequence or are covered up. | Cynicism, resignation and erosion of the internal culture of integrity and trust. |
| 4 | Process hurdles and account requirement | Web reports dominate with 33.4 %, but often suffer from registration requirements. | Frustration over account creation, password hurdles and unclear process steps. | Early abandonment of the reporting process; fall back to informal, unprotected routes. |
| 5 | Social pressure and stigmatisation | About 1 in 3 incidents is not reported because of loyalty conflicts (ECI). | Fear of the "informer" stigma and loss of social integration in the team. | Structural walling-off of departments against compliance initiatives. |

## The Performance Architecture of unpruuf Compliance in System Comparison

Overcoming the identified barriers requires technical and procedural safeguards that do not merely promise anonymity and security of action but anchor them in the architecture. unpruuf answers these challenges with two products on the same system: the reporting channel unpruuf Compliance for formal reports (reporting persons report through the app, the responsible person works in the dashboard) and unpruuf Business for confidential internal communication.

### Fear of retaliation: the zero-identity principle

The fear of retaliation is fed at its core by the fact that conventional systems capture personal identifiers or store identity data on central platforms. unpruuf Compliance counters this by decoupling the process from every identity. Throughout the system, no names, dates of birth, e-mail addresses or telephone numbers are collected, and there are no user accounts. The server stores, per packet, only a storage address, the encrypted packet and two timestamps; it stores no sender address and no browser or device details (supported by evidence scripts 02 and 03 in the evidence package). Where no identity data is collected, the server holds no identities that could be handed over or stolen in a break-in, a configuration error or a request for disclosure. This removes an essential basis for targeted retaliation, but does not rule it out: the content of a report itself (details, wording, timing) can allow conclusions about the reporting person, and no technology can prevent that.

### Doubts about anonymity: server sovereignty with the customer

Standard SaaS whistleblowing systems are mostly operated on the servers of third-party providers or US cloud hyperscalers, which fuels considerable doubt about confidentiality among employees. With unpruuf Compliance, the customer company runs the server itself, on its own machine or a rented server; NexonAI operates no servers and has no access, neither through remote maintenance nor through telemetry. Only encrypted packets are on the server, and only for a short time: at most 24 hours (default 6). The case files themselves are stored locally and encrypted on the computer of the responsible person, protected by that person's password.

The report itself travels over the Tor network. The app contains no analytics libraries, no advertising libraries and no Google services. Whoever administers the server sees only encrypted packets, neither content nor identities; the case files can only be read by someone who knows the responsible person's password. Not protected is a computer that someone else controls (for example through malware on the responsible person's laptop): there, reading along during use is possible.

### Powerlessness: case number, return channel and visible deadlines

To counter the feeling of powerlessness, the channel is built to work in both directions. Reporting persons scan the organisation's QR code (one code for everyone, bound to no person), write their report and receive a case number straight away. Receipt is confirmed automatically. In the "My case" screen of the app they see status and deadlines; questions and replies from the responsible person arrive in the same conversation, without the reporting person having to reveal their identity. Access to the conversation is tied to the app on the reporting person's phone: whoever deletes the app or changes phone loses access to this conversation (a new report is possible at any time).

In the dashboard, the responsible person sees the deadlines in colour, for example the acknowledgement of receipt within 7 days and the feedback within 3 months under Article 9 of Directive 2019/1937. Meeting the deadlines remains the organisation's task; unpruuf makes them visible.

On the suspicion of internal cover-up: cases can be fully exported as a file and deleted individually. Deleting is a deliberate action by the responsible person and serves data minimisation and storage limitation (Directive 2019/1937 Articles 17 and 18, GDPR Article 5). A tamper-proof audit log that would make later removal of cases visible is not part of the current scope. Whoever requires such verifiability for auditors must currently ensure it by exporting before deleting and keeping the export themselves.

### Process complexity: a low hurdle, but not zero

The operational entry hurdle is limited to what is necessary, but it is not zero. Reporting persons install the app once (today for Android; an iOS version is in progress), scan the organisation's QR code and write their report. There is no registration, no password, no e-mail address and no verification. Whoever cannot or does not want to install anything can use a browser variant. It is a makeshift solution: it runs without Tor and without the device protection of the app, and it carries its own notice. The hurdle "install software" therefore exists on the regular route, and it should be named and explained honestly at roll-out (for example with the QR code on a notice board and a short guide).

### Social pressure: protected communication before a report

To absorb social ostracism and loyalty conflicts, a formal reporting channel is often not enough, since employees often look for orientation and informal advice before an official report. This is where the interplay with unpruuf Business comes in, an internal communication solution that also works without user accounts. Contacts arise only by scanning a QR code in person, that is, only with people one knowingly trusts. Messages stay on the server for at most 24 hours (default 6); after that they are unreadable for everyone and are overwritten in the files within about a minute. On the phone, messages are not written to the storage medium; they exist only in working memory.

Because of this volatile storage, the operator keeps no permanent chat logs of the kind that arise in standard collaboration tools and could later be used against those involved. What conversation partners record themselves, for example a photo of the screen, unpruuf cannot prevent. Employees thus get a more protected space to clarify facts before a formal report.

## Comparison: Conventional Reporting Channels, Standard SaaS and unpruuf Compliance

| Feature | Traditional channels (e-mail, telephone, ombudsman) | Standard SaaS reporting portals | unpruuf Compliance (with unpruuf Business) |
|---|---|---|---|
| Infrastructure and server sovereignty | Internal mail servers or external telephone lines; transmission in clear text. | Multi-tenant cloud of the vendor (often hyperscaler with third-country transfer). | Operation on the customer company's own server; NexonAI operates no servers and has no access. |
| Identity management | Sender data, IP headers or telephone numbers visible by nature. | Often profile registration, e-mail verification or complex passwords. | Zero-identity principle: no names, no e-mails, no accounts; no sender address on the server. |
| Effort for reporting persons | Low, but without protection of identity. | Browser, often with registration. | Install the app once (Android), scan the organisation's QR code; no account. Browser variant as makeshift. |
| Return channel for questions | Insecure or requires revealing identity; often breach of confidentiality. | Proprietary mailboxes, often tied to registration or user ID. | Two-way conversation in the app via the case number, without account and without identity. |
| Deadlines and procedural transparency | Manual in Excel or mailboxes; error-prone and opaque for the reporting person. | Workflow-supported, transparency for the reporting person varies greatly by module. | Deadlines in colour in the dashboard; the reporting person sees status and deadlines in the "My case" screen. |
| Verifiability of the archive | Poor; mails and documents can be deleted or manipulated. | Standard database archiving; manual deletion by administrators often possible. | Cases exportable and individually deletable (data minimisation); no tamper-proof audit log in the current scope. |
| Communication before a report and within teams | Unencrypted mails or persistent chats with IT access. | No functions for informal preliminary coordination. | unpruuf Business: conversations without accounts; packets on the server at most 24 hours (default 6). |
| Legal classification (HinSchG / EU Directive) | Often insufficient regarding data protection and confidentiality. | Formally lawful, but often with data protection concerns because of US cloud. | The architecture supports the requirements for confidentiality and data minimisation (Directive Articles 16 to 18, GDPR Articles 5, 25, 32). The legal classification is confirmed by a lawyer or the organisation's data protection officer. |
| Maturity | Established. | Established, with references and certifications. | Pilot phase; not independently audited; no reference customers. |

## Strategic Governance Implications

Setting the empirical barriers against the system architecture shows fundamental connections for compliance management. The findings of the FH Graubünden refute the widespread prejudice that anonymous reporting channels lead to a flood of malicious defamation: the share of abusive reports is stable at about 11 percent and does not differ between anonymous and identifiable systems. The decisive lever lies rather in damage limitation. When companies remove barriers, whistleblowers uncover misconduct markedly earlier on average. According to the Whistleblowing Report 2025, companies with functioning reporting systems were able to avert more than half of the financial damage early.

The success of a reporting system is therefore measured not by its existence but by the psychological safety that its technical architecture conveys. Standard solutions that treat anonymity merely as an organisational promise fail against the deep-seated fears of employees. The structural separation of identity and case handling, operation on the organisation's own server and a return channel without an account form the functional basis for lowering the barriers of fear and futility.

## Conclusion

The empirical evidence shows that whistleblower systems rarely fail because of legal deficits, but primarily because of the workforce's lack of trust in protection from retaliation, technical anonymity and the effectiveness of the procedure. Conventional reporting channels and externally hosted standard tools often reinforce these reservations through persistence of metadata and account requirements.

unpruuf Compliance addresses the five dominant barriers through a data protection and security architecture designed for data minimisation: the zero-identity principle, the return channel via the case number in the app, visible deadlines and operation on the organisation's own server, and, in unpruuf Business, volatile communication with a server lifetime of at most 24 hours. This lowers the personal risk of submitting a report and creates a basis for reliable organisational integrity. It does not replace the organisation's responsibility to examine reports seriously and to protect reporting persons from retaliation.

## Status and Limits

- unpruuf Compliance is in the pilot phase and is **not independently audited**. An internal security review and an evidence package exist; an independent audit report is outstanding. Until then, all statements on security and data protection are statements of the manufacturer.
- Not yet tried on a real phone and not on the real Tor network (as of 27 October 2026). The browser variant offers less protection than the app.
- Whether this is a lawful internal reporting channel is for the organisation to confirm with its lawyer or data protection officer. In Romania (Law 361/2022) the position on anonymous reports is open; it should not be claimed that they are mandatory.
- The figures on barriers and procedure duration come from the third-party studies named and were not re-verified here.

## Sources

1. unpruuf | Kommunikation in eigener Hand, https://nexonai.ro/
2. Betriebs-Berater Compliance 5 / 2022, https://www.kms-law.de/assets/downloadcenter/Hinweisgeberschutz-durch-Vertrauensanwaelte-CB-Mai-2022.pdf
3. Whistleblowing Report 2025 - Fachhochschule Graubünden, https://www.fhgr.ch/news/newsdetail/whistleblowing-report-2025/
4. ECI's 2023 Global Business Ethics Survey Reveals Harsh Realities, https://www.navex.com/en-us/blog/article/ecis-2023-global-business-ethics-survey-reveals-harsh-realities-about-ec-programs/
5. The NAVEX 2025 Whistleblowing Benchmark Report Highlights, https://www.accessnewswire.com/newsroom/en/computers-technology-and-internet/the-navex-2025-whistleblowing-benchmark-report-highlights-signifi-1001590
6. Whistleblowing Report 2025: 40 Prozent der deutschen ... - EQS News, https://www.eqs-news.com/news/corporate/whistleblowing-report-2025-40-prozent-der-deutschen-unternehmen-berichten-von-missstanden-in-ihrer-organisation-oder-lieferkette/4b7c0c98-f5e6-478b-bbda-e1299c874c57
7. Global Business Ethics Survey 2018 Q4 Final - Scribd, https://www.scribd.com/document/415639865/Global-Business-Ethics-Survey-2018-Q4-Final
8. EQS Integrity Line: Hinweisgebersystem-Software & Fallmanagement, https://www.eqs.com/de/compliance-management-platform/integrity-line-whistleblower-software/
9. CFI CBCA Professional Ethics Exam Questions and Answers, https://www.docsity.com/en/docs/cfi-cbca-professional-ethics-exam-questions-and-answers-verified-solutions-100percent-guaranteed/18809102/
10. With Retaliation on the Rise, How Can You Maintain a Culture of, https://www.corporatecomplianceinsights.com/retaliation-culture-integrity/
11. 2026 Whistleblowing Statistics & Benchmarking - NAVEX, https://www.navex.com/en-us/northstar/whistleblowing-statistics-benchmark-report/
12. 2025 Whistleblowing Statistics & Benchmarking - NAVEX, https://www.navex.com/en-us/northstar/whistleblowing-statistics-benchmark-report-2025/
13. Inhalt - Fachmedien Recht und Wirtschaft, https://www.ruw.de/news/media/2/Compliance--Oktober-2025-17522.pdf
14. 2018-ECI-GBES-Measuring-Impact-Ethics-Compliance-Programs.pdf, https://cdn.eci-insights.com/2018-ECI-GBES-Measuring-Impact-Ethics-Compliance-Programs.pdf
15. The Whistleblowing Process - NAVEX, https://www.navex.com/en-us/platform/employee-compliance/whistleblowing-process/
16. Blogartikel: Aufsichtsräte und Hinweisgeberschutz, https://www.integrityline.com/de/knowhow/blog/aufsichtsrat-hinweisgeberschutz/
17. Compliance Corner – Issue 3.2 - VCU Blogs, https://blogs.vcu.edu/ico/2024/03/01/compliance-corner-issue-3-2/
18. Whistleblowing and Incident Management Benchmark Report, https://cdn.lawreportgroup.com/acuris/files/ACR-New/2025_03%20Navex%20Benchmark%20Survey%20Report.pdf
19. Whistleblower - das sollten Sie jetzt wissen [inkl. On-demand Webinar], https://www.dataguard.de/blog/whistleblower
20. Effizientes Compliance-System für Schweizer KMU, https://www.juridissimo.ch/wie-bauen-sie-ein-schlankes-compliance-system-auf-das-auch-fur-kleinbetriebe-bezahlbar-ist/
21. Besonders KMU unterschätzen das Risiko unentdeckter Missstände, https://www.beobachter.ch/gesellschaft/besonders-kmu-unterschatzen-das-risiko-unentdeckter-missstande-867391
