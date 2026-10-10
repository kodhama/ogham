---
title: Principle rationale - research pass (U1)
date: 2026-10-08
unit: U1
plan: docs/plans/2026-10-08-0641-feat-ogham-coding-standards-companion-plan.md
requirements: [R6, R4]
---

# Principle rationale - research pass (U1)

**What this gives U3:** a cited rationale for each principle in R1 and R2, the answer on the agents question, and corrected Ray/Berger citations. **No rule is removed** (R6). Research sharpens wording and examples; it does not veto.

**The short version:**

| Principle | Strength | What it changes for U3 |
|---|---|---|
| P1 Pure by default | **Design argument** for testability. **Contested** for "fewer bugs" | Lead the rationale with testability. Read the clock at the edge, pass the time in. Propose a marked performance exception |
| P2 Effects and mutation marked | **Design argument**, an old convention | Keep Math Quest 16's four markers; no type-level effect system. CQS cases such as pop are marked by name |
| P3 Thin effectful code | **Design argument only** | Answer Transaction Script in the rationale. Two possible exceptions (cohesion cost, data too big to load first) are Gonçalo's call |
| P4 Immutable by default | **Indirect** for module-level state (one study of true globals). **Design argument, contested on usability** for the rest | State the rule as "don't mutate". Keep `readonly` as the marker, and say it is shallow, not a guarantee |
| P5 Functions as first-class values | **Contested** on readability | Pass behaviour where it removes duplication. Keep lambdas short; they mutate nothing they capture except local building |
| P6 Data apart from behaviour | **Design argument, contested** by an OO school and one case study | Name the anemic-model objection and answer it, including where business rules live |
| P7 Agents and isolated code | **Indirect** (proxy evidence, models not agents) | Models do better on self-contained code. Do **not** claim they do better in FP languages |
| Ray 2014 / Berger 2019 | Citations **confirmed**, with corrections | The Product Contract's "contested" holds. Add DOIs; note the rebuttals |

**Every exception named below is a marked effect, never a silent carve-out**, as Math Quest 11 already does for `shuffleInPlace`: it carries P2's markers, and where lint fires it needs a code-level exception naming the effect (R14). **Exceptions that would narrow a rule are proposals for Gonçalo at U3**, not decisions (R6). **U3 decides where each suggestion lands:** the 900-word core, the TypeScript page or the rubric.

Strength labels are this document's judgement, not the sources' words: **supported** means at least one empirical study backs the claim; **contested** means credible sources disagree; **design argument** means practitioner reasoning with no empirical test found; **indirect** means the evidence measures a nearby thing, not the claim itself.

---

## Method

- **Scope:** the five R1 principles, R2's data/behaviour split, the agents question (U1 step 3) and the Ray/Berger check (U1 step 4). Math Quest rules 11–16 are folded into P1–P4 as the plan maps them.
- **Leads (deviation from KTD12):** KTD12 and D16 said Gemini finds sources. Headless `agy` 1.2.10 returned empty output on all eight lead runs, and the maintainer ruled (D18, hq records) that **Claude WebSearch and WebFetch find the leads instead**. One Claude subagent per topic searched and enumerated sources as title, URL, stance and verbatim quote, with at least one dissenting source where one exists. One other difference from KTD12's "the worker reads each source": see **Reading** below.
- **Budget:** six sources considered per topic, two to four cited. The considered-but-not-cited ones are listed at the end of each section.
- **Quote check:** WebFetch passes pages through a summariser, so it is not proof of a verbatim quote. Every quote was checked by a script that downloads the raw page or PDF with `curl`, extracts its text, and matches the quote after normalising whitespace, typographic quotes, ligatures and line-break hyphens (wording must match). The subagents ran it on every quote; the worker re-ran it on a fresh download. **82 of 84 quotes matched on the re-run.** The two exceptions are from Rytz et al. (P2): the EPFL server now answers `curl` with an empty `202`, and both quotes matched the copy fetched an hour earlier.
- **Paywalls:** `dl.acm.org` and `cacm.acm.org` refuse `curl` (403). ACM papers are cited from the authors' own copies, arXiv, or the Crossref DOI record, and the DOI is given.
- **Reading:** the worker read the surrounding text of every quote that carries a strength label or a dissent, and checked the rest against the abstract or passage they come from. Uesbeck 2016 and Nielebock 2019 were read as abstracts only (paywalled). The subagents' stance labels were changed where context disagreed (noted inline).
- **Doc review:** `ce-doc-review` ran coherence, feasibility and adversarial reviewers (Claude) on the revised draft: 13 findings, all accepted, merged into 10 fixes. Its cross-model pass was skipped because Codex Sol had already reviewed this document.
- **Check:** Codex Sol (gpt-5.6-sol, high effort, web search, read-only) checked the citations and looked for counter-evidence: 19 findings. The worker checked every evidence quote it gave with the same script (all 18 matched), read their context, and triaged each one; 18 were accepted, 1 partly (its source was secondary, see P4). Counter-evidence that came from this check is marked **(from the citation check)** and sits outside the six-lead budget. The triage is attached to the PR.

---

## P1. Pure by default

**Claim (R1; Math Quest 11–13):** functions compute from their arguments and return a result; no hidden inputs (clock, randomness, environment), no side effects. Local building inside a function is fine.

**Sources cited:**
- **Carmack, "Functional Programming in C++" (2012).** "Pure functions are trivial to test; the tests look like something right out of a textbook, where you build some inputs and look at the output." Also: "Programming in a functional style makes the state presented to your code explicit, which makes it much easier to reason about, and, in a completely pure system, makes thread race conditions impossible." <https://www.gamedeveloper.com/programming/in-depth-functional-programming-in-c-> (republication; the AltDevBlogADay original is offline)
- **Seemann, "Functional design is intrinsically testable" (2015).** "An ideal function is Isolated, and that means that it's intrinsically testable." <https://blog.ploeh.dk/2015/05/07/functional-design-is-intrinsically-testable/>
- **Oracle, `java.time.Clock` API docs (Java SE 8).** "Best practice for applications is to pass a Clock into any method that requires the current instant." <https://docs.oracle.com/javase/8/docs/api/java/time/Clock.html>
- **Hughes, "Why Functional Programming Matters" (1989).** He lists the usual benefit, "A function call can have no effect other than to compute its result. This eliminates a major source of bugs…", then warns: "Such a catalogue of "advantages" is all very well, but one must not be surprised if outsiders don't take it too seriously." <https://www.cse.chalmers.se/~rjmh/Papers/whyfp.pdf>

**Strength:** **design argument for testability and reasoning; contested for defect reduction.** The testability case is broad practitioner consensus plus an official language API built for it, but no empirical study of it was found. One practitioner dissents on the means: Holub (P3) argues that "if your goal is to facilitate testing without mocking, architecting your solution for high-level testing is likely going to be a much better time investment." The defect case rests on language-level studies whose small effect is disputed after reproduction (see Ray/Berger below). Hughes, a founder of the field, makes the same point: absence of side effects is a weak sell; his case is modularity.

**Suggested changes:**
- **Lead the rationale with testability and local reasoning**, not "fewer bugs".
- **Use the clock as the canonical hidden-input example.** Java's docs say to "pass a Clock into any method that requires the current instant". But a passed-in live clock is still an effect: "Applications use an object to obtain the current time rather than a static method." So the effectful edge reads the clock, and the pure core receives the time as a value.
- **Name a performance exception (from the citation check).** Carmack, in the same essay: "Programming with pure functions will involve more copying of data, and in some cases this clearly makes it the incorrect implementation strategy due to performance considerations." Propose large in-place updates as an allowed effect when marked, as Math Quest 11 allows `shuffleInPlace`.
- **No source was found on injecting randomness.** Math Quest 16 already has core code take "a `now`, a seed" as parameters; keep that as a design argument by analogy with the clock.

**Considered, not cited:** Ray et al. 2014 and Berger et al. 2019 (covered in their own section).

---

## P2. Effects and mutation marked

**Claim (R1; Math Quest 16):** mutation and side effects are explicit and named, so a reader can tell from a call site that it changes something.

**Sources cited:**
- **Meyer, "Basic Eiffel language mechanisms" (2006).** "Queries must not modify the instance." <https://se.inf.ethz.ch/~meyer/publications/online/eiffel/basic.html> (his online notes; *Object-Oriented Software Construction* is not open access)
- **Fowler, "CommandQuerySeparation" (2005).** "The really valuable idea in this principle is that it's extremely handy if you can clearly separate methods that change state from those that don't." He also names the limit: "Popping a stack is a good example of a query that modifies state." <https://martinfowler.com/bliki/CommandQuerySeparation.html>
- **Swift API Design Guidelines.** "Name functions and methods according to their side-effects". <https://www.swift.org/documentation/api-design-guidelines/index.html>
- **Rytz, Odersky, Haller, "Lightweight Polymorphic Effects" (ECOOP 2012).** "We believe that the main obstacle to using effect systems in day-to-day programming is their verbosity, especially when writing functions that are polymorphic in the effect of their argument." <https://infoscience.epfl.ch/record/175240/files/ecoop_1.pdf?version=1> (quote matched on the first fetch only; see Method)

**Strength:** **design argument.** Command-query separation and side-effect naming are long-standing conventions with official-language endorsement (Swift). No study measuring defects was found. The dissent is about cost, not direction: type-level effect systems are verbose (Rytz).

**Suggested changes:**
- **Keep Math Quest 16's four markers:** name, `readonly` type, an `Effect:`/`Mutates:` docblock line, and place. **Don't add a type-level effect system**; Rytz et al. argue (a stated belief, not a measured finding) that their verbosity is the main obstacle to everyday use, and TypeScript has none.
- **Names cannot carry effects that come from arguments.** Rytz et al.: "the effect of a function can depend on the effect its arguments" (sic). A higher-order function is marked by what it does itself; the functions passed to it follow P5 (they capture nothing they mutate).
- **Name the accepted CQS cases** (pop, dequeue, iterator `next`). They are still marked effects; their names already say so.

**Considered, not cited:** Leijen, Koka effect types (arXiv:1406.2061), which shows effects in the type signature; Coblenz et al. 2016, used under P4.

---

## P3. Thin effectful code

**Claim (R1; Math Quest 15):** code that performs effects does only that; no business logic in effectful code.

**Sources cited:**
- **Bernhardt, "Functional Core, Imperative Shell" (2012).** "This functional core is surrounded by a shell of imperative code: it manipulates stdin, stdout, the database, and the network, all based on values produced by the functional core." And: "It also leads to an imperative shell with few conditionals, making reasoning about the program's state over time much easier." <https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell> (screencast summary page; the full argument is the paid video)
- **Cockburn, "Hexagonal Architecture" (2005).** "One of the great bugaboos of software applications over the years has been infiltration of business logic into the user interface code." <https://alistair.cockburn.us/hexagonal-architecture/>
- **Holub, "Pure-Impure Segregation Principle" (2020).** "However, this is not always practical and there are scenarios where extracting pure code comes at a cost of severely reduced cohesiveness." <https://tyrrrz.me/blog/pure-impure-segregation-principle>
- **Seemann, "Song recommendations from combinators" (2025).** "With sufficiently large data sizes, the Impureim Sandwich pattern starts to buckle." <https://blog.ploeh.dk/2025/06/09/song-recommendations-from-combinators/>

**Strength:** **design argument only.** Bernhardt states the function-level rule. Cockburn supports it at the architecture level: business logic stays out of the adapters at the system's edge. Neither is an empirical study, and none was found. Both dissents are limits, not reversals. Seemann, the pattern's main advocate, says himself it "starts to buckle" with large data.

**Suggested changes:**
- **Keep the rule.** The sources name two limits: cohesion cost (Holub) and data too large to load before deciding, such as streaming or pagination (Seemann). Math Quest 15 has no exceptions today, so **whether either becomes a marked exception is an open question for Gonçalo** (see Open questions).
- **Fowler's Transaction Script is the canonical counter-pattern (from the citation check).** "A Transaction Script organizes all this logic primarily as a single procedure, making calls directly to the database or through a thin database wrapper." <https://martinfowler.com/eaaCatalog/transactionScript.html> The rationale should answer it: ogham keeps the split even for simple transactions, because the decision logic then tests without the database (P1).
- **Example:** an effectful function whose only branch is whether the effect succeeded.

**Considered, not cited:** Seemann, "Impureim sandwich" (2020); Moseley and Marks, "Out of the Tar Pit" (2006), used under P6.

---

## P4. Immutable by default

**Claim (R1; Math Quest 11, 14):** return new values instead of mutating inputs; no module-level mutable state.

**Sources cited:**
- **Coblenz et al., "Glacier: Transitive Class Immutability for Java" (ICSE 2017).** "We found that even after being given instructions on how to express immutability with final, participants who used final were unable to express immutability correctly, whereas almost all participants who used Glacier succeeded." <https://www.cs.cmu.edu/~jssunshi/assets/pdf/coblenz2017glacier.pdf>
- **Coblenz et al., "Exploring Language Support for Immutability" (ICSE 2016).** "Non-transitive restrictions provide weak guarantees because they say little about the behavior of the abstraction that the object's interface provides." <https://www.cs.cmu.edu/~jssunshi/assets/pdf/coblenz2016exploring.pdf> (DOI 10.1145/2884781.2884798)
- **Selby, Ruffell, Giesbrecht, Godfrey, "Recovering Maintainability Effort in the Presence of Global Data Usage" (WCRE 2007).** "This provides evidence that a strong relationship exists between the usage of global variables and both the number and scope of changes applied to files between product releases." <https://cs.uwaterloo.ca/~mwg/files/wcre2007.pdf>. Two limits. The authors note one themselves: frequent change "may be a sign of successful growth rather than poor design." And the study measures true, cross-module globals; file-scoped statics, the closest match to a JavaScript module-level variable, are excluded (from the citation check).
- **Eyolfson and Lam, "How C++ Developers Use Immutability Declarations: An Empirical Study" (ICSE 2019, DOI 10.1109/ICSE.2019.00050).** "Best practices for developers, as encoded in recent programming language designs, recommend the use of immutability whenever practical. However, there is a lack of empirical evidence about the uptake of this advice." <https://www.patricklam.ca/papers/19.icse.empirical-static-const.pdf>

**Strength:** **indirect for no module-level state** (one correlational study of cross-module globals and change cost, not defects); **design argument, contested on usability, for immutability in general.** The Coblenz group, the main empirical voice here, points to "the lack of empirical data to justify specific design choices", and no study measuring immutability's effect on defects was found. Their user study does show that **shallow, convention-only immutability fails in practice**, and that compile-time enforcement works.

**Usability counter-evidence (from the citation check):** Weber et al. (IEEE SecDev 2017) report an earlier study by Stylos and Clarke, in which 30 professional programmers "strongly preferred and were more effective in using create-set-call style APIs", and they add that "an immutable object cannot be created using the Create-Set-Call style." Weber et al.'s own conclusion points the other way: their paper brings together results that "aim to show that immutability, when carefully designed using usability as a first-class requirement, can have positive effects on both usability and security." <https://www.cs.cmu.edu/~marmalade/papers/Weber-IEEE-2017.pdf>

**Suggested changes:**
- **State the rule as behaviour (don't mutate inputs or shared state).** Keep `readonly` as Math Quest 16's mutation marker; it signals intent.
- **On the TypeScript page, say that `readonly` and `as const` mark intent but do not guarantee full immutability**, citing TypeScript itself: "const contexts don't immediately convert an expression to be fully immutable" (TypeScript 3.4 release notes, <https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html>). Coblenz 2016 explains why that matters.
- **Lint enforcement is an analogy, not a tested result.** Glacier enforced immutability through the type checker ("Glacier prevented these problems at compile time"). That enforcement beats convention supports having a checker at all; whether a lint preset gets the same effect is untested.
- **Make immutable construction easy** (builders, object literals, `with`-style copies) so the usability cost Stylos and Clarke found doesn't push people back to mutation.

**Considered, not cited:** Lu et al., ASPLOS 2008, on concurrency bugs (shared-state bugs are hard to fix, but the paper says nothing about immutability; the subagent marked it "supports", downgraded here to indirect); Berger et al. 2019 (covered below).

---

## P5. Functions as first-class values

**Claim (R1):** pass behaviour as values, using higher-order functions such as map, filter and reduce where they make code shorter and remove duplication.

**Sources cited:**
- **Hughes, "Why Functional Programming Matters" (1990 edition, in *Research Topics in Functional Programming*; first published 1989 in *The Computer Journal*).** "In this paper we show that two features of functional languages in particular, higher-order functions and lazy evaluation, can contribute significantly to modularity." <https://www.cs.kent.ac.uk/people/staff/dat/miranda/whyfp90.pdf>
- **Mazinanian, Ketkar, Tsantalis, Dig, "Understanding the Use of Lambda Expressions in Java" (OOPSLA 2017).** "Lambdas are used for various reasons, including but not limited to (i) making existing code more succinct and readable, (ii) avoiding code duplication, and (iii) simulating lazy evaluation of functions." <https://users.encs.concordia.ca/~nikolaos/publications/OOPSLA_2017.pdf> (DOI 10.1145/3133909)
- **Uesbeck et al., "An Empirical Study on the Impact of C++ Lambdas and Programmer Experience" (ICSE 2016).** "Results afford some doubt that lambdas benefit developers and show evidence that students are negatively impacted in regard to how quickly they can write correct programs to a test specification and whether they can complete a task." <https://digitalscholarship.unlv.edu/compsci_fac_articles/6> (abstract page; DOI 10.1145/2884781.2884849)
- **Nielebock et al., "Programmers do not Favor Lambda Expressions for Concurrent Object-Oriented Code" (EMSE 2019).** "Second, for all three of the languages, we observed that developers compromise their code by applying a significantly higher number of impure, capturing lambda expressions, which are capable of causing race conditions." <https://2018.fseconference.org/details/fse-2018-Journal-First/12/Programmers-do-not-Favor-Lambda-Expressions-for-Concurrent-Object-Oriented-Code> (abstract page; DOI 10.1007/s10664-018-9622-9)

**Strength:** **contested on readability; design argument for modularity.** Developers use lambdas to cut duplication (Mazinanian). Controlled studies find costs: C++ lambda syntax slowed students down (Uesbeck), and automated lambda refactorings lowered model-estimated readability (Lucas et al., below). Nielebock's finding cuts the other way for ogham: in concurrent Java, C# and C++ code, the risky lambdas are the **impure, capturing** ones, which P1 limits to local building.

**Suggested changes:**
- **Frame P5 as passing behaviour where it removes duplication**, not as always using map and filter.
- **Prefer a named function over a long inline lambda.**
- **A passed function mutates nothing it captures, except a value the enclosing function just built** (local building, Math Quest 12). This links P5 to P1 and cites Nielebock. Ordinary read-only closures such as `xs.map(x => x * factor)` are fine.
- **A lambda can drop a contract (from the citation check).** Mazinanian et al. found that when a lambda implements an interface method, annotations such as `@NotNull` on that method are no longer visible, "thus increasing the chance of a bug". In TypeScript, give a passed function an explicit type when the inferred one would hide a constraint.

**Considered, not cited:** Oracle Java Tutorials on lambdas (definitional); Lucas et al., JSERD 2020, "Our results suggest that the transformations recommended by the aforementioned tools decrease program comprehension when assessed by two state-of-the-art models to estimate readability" (mixed; practitioners rated some transformations better).

---

## P6. Data apart from behaviour

**Claim (R2):** data structures carry no business logic; behaviour lives in functions, or in behaviour-only classes that dispatch on their arguments. This holds in OO languages too.

**Sources cited:**
- **Hickey, "Simple Made Easy" (Strange Loop 2011).** "Objects complect state, identity, and value." And: "If you leave data alone, you can build things once that manipulate data, and you can reuse them all over the place, and you know they're right once and you're done." <https://raw.githubusercontent.com/matthiasn/talk-transcripts/master/Hickey_Rich/SimpleMadeEasy.md> (community transcript; video at infoq.com/presentations/Simple-Made-Easy/)
- **Goetz, "Data Oriented Programming in Java" (InfoQ 2022).** "Data-oriented programming encourages us to model data as (immutable) data, and keep the code that embodies the business logic of how we act on that data separately." He also limits it: "The techniques of OOP and data-oriented programming are not at odds; they are different tools for different granularities and situations." <https://www.infoq.com/articles/data-oriented-programming-java/>
- **Fowler, "AnemicDomainModel" (2003).** "The fundamental horror of this anti-pattern is that it's so contrary to the basic idea of object-oriented design; which is to combine data and process together." <https://martinfowler.com/bliki/AnemicDomainModel.html>
- **Fowler, "TellDontAsk" (2013).** "Good design is all about trade-offs, and co-locating data and behavior is just one factor to bear in mind." <https://martinfowler.com/bliki/TellDontAsk.html>

**Strength:** **design argument, contested.** R2 is the exact pattern Fowler named an anti-pattern in 2003. Ten years later he calls co-location "just one factor". Java's language architect (Goetz) endorses the split for "simple services that process plain, ad-hoc data", while saying "When we're modeling complex entities, OO techniques have a lot to offer us." **One case study disagrees with R2 (from the citation check):** Cemus et al. (SOFSEM 2016, DOI 10.1007/978-3-662-49192-8_36) found that "the Anemic Domain Model usually used within the three-layered architecture fails to address cross-cutting concerns such as business rules", restating rules in many places. Its authors were proposing a third, aspect-based model, and it is one system. <https://cs.baylor.edu/~donahoo/papers/CCM%2B16.pdf>

**Suggested changes:**
- **The rationale should name the anemic-domain-model objection and answer it**: ogham chooses the split for testability and reuse (P1, Hickey), knowingly.
- **Use Goetz's framing for OO languages, with his scope:** records and data classes for data, logic in separate functions or services. Say how ogham handles his counter-case, complex entities with invariants.
- **Say where business rules live** so they are written once and not restated across services. That answers Cemus et al.'s duplication finding.

**Considered, not cited:** Sharvit, "Principles of Data-Oriented Programming" (2022), "In a data-oriented system, code is separated from data."; Moseley and Marks, "Out of the Tar Pit" (2006).

---

## P7. How coding agents handle pure, isolated code

**Question (U1 step 3):** what evidence exists on how coding agents handle pure, effect-isolated code (testability, refactoring, error rates)?

**Sources cited:**
- **Yu et al., "CoderEval: A Benchmark of Pragmatic Code Generation with Generative Pre-trained Models" (ICSE 2024, DOI 10.1145/3597503.3623316).** "By evaluating three code generation models on CoderEval, we find that the effectiveness of these models in generating standalone functions is substantially higher than that in generating non-standalone functions." <https://arxiv.org/abs/2302.00288>
- **Du et al., "Evaluating Large Language Models in Class-Level Code Generation" (ICSE 2024, DOI 10.1145/3597503.3639219; the preprint and benchmark are named ClassEval).** "First, we find that all existing LLMs show much worse performance on class-level code generation compared to on standalone method-level code generation benchmarks like HumanEval…" <https://arxiv.org/abs/2308.01861>
- **Chen, Wang et al., "Context Matters" (CATGen, arXiv 2026).** "In real-world projects with complex frameworks and cross-file dependencies, LLM-generated tests frequently fail to compile, require costly manual repair, or provide unstable coverage improvements." <https://arxiv.org/abs/2607.19682>
- **Lang et al., "Perish or Flourish?" (FPEval, arXiv 2026).** "…error rates remain significantly higher in purely functional languages (Haskell and OCaml) than in hybrid (Scala) or imperative (Java) languages." Also: "Moreover, LLMs frequently generate non-idiomatic functional code that follows imperative patterns, raising concerns about code style and long-term maintainability." <https://arxiv.org/abs/2601.02060>

**Strength:** **indirect.** No study splits agent results by purity or side effects, and these benchmarks test code-generation **models**, not autonomous agents. What exists measures **context dependency**: in CoderEval, a standalone function uses only built-in functions and standard libraries. Models do markedly better on standalone code (CoderEval, ClassEval), and generated tests break on cross-file dependencies (CATGen). **Purity is not the same as standalone**: a pure function may call other project functions. The overlap is that a pure function's inputs are all in its signature, so the proxy is suggestive, not direct.

**A limit (from the citation check):** when a function does depend on others, the remedy is to give the model that context, not to hide it. RepoExec (Hai, Nguyen, Bui, NAACL Findings 2025) found that "retaining full dependency context yields the best performance, while smaller context sizes can be misleading." <https://aclanthology.org/2025.findings-naacl.82/> **FPEval cuts against a different claim:** models make more errors in purely functional *languages*, and default to imperative patterns.

**Suggested changes:**
- **The core may say models generate self-contained functions more reliably**, citing CoderEval, labelled as evidence about dependencies, not purity, and about models, not agents. ClassEval shows a related drop from method-level to class-level tasks, not a dependency effect. Neither shows that restructuring the same code helps; they compare different tasks.
- **Do not claim agents do better in functional languages.** The evidence says the opposite.
- **FPEval found that models writing functional languages often fall back to imperative patterns.** That is suggestive, not tested for agents or TypeScript, and is one reason for the lint preset and rubric.

**Considered, not cited:** Maaz et al., "Agentic Property-Based Testing" (2025), an agent that infers function properties and found real bugs (56% of reports valid), relevant but not split by purity; Pomian et al. (2024), LLM extract-method suggestions "up to 76.3%" hallucinations, not split by side effects.

---

## Ray et al. 2014 and Berger et al. 2019: citation check

The Product Contract cites both from memory. **Both are confirmed; the details below replace the memory version.**

- **Ray, Posnett, Filkov, Devanbu. "A Large Scale Study of Programming Languages and Code Quality in Github." FSE 2014, pp. 155–165. DOI 10.1145/2635868.2635922.** "We also find that functional languages are somewhat better than procedural languages." They add: "However, we hasten to caution the reader that even these modest effects might quite possibly be due to other, intangible process factors…" <https://web.cs.ucdavis.edu/~filkov/papers/lang_github.pdf>
  - A CACM version (2017, 60(10):91–100, DOI 10.1145/3126905) has the same title and **a different author order** (Ray, Posnett, Devanbu, Filkov).
- **Berger, Hollenbeck, Maj, O. Vitek, J. Vitek. "On the Impact of Programming Languages on Code Quality: A Reproduction Study." ACM TOPLAS 41(4), 2019, Article 21, pp. 21:1–21:24. DOI 10.1145/3340571; arXiv:1901.10220.** "We uncover a number of flaws that undermine the conclusions of the original study as only four languages are found to have a statistically significant association with defects, and even for those the effect size is exceedingly small." <https://arxiv.org/pdf/1901.10220>
- **Ray, Devanbu, Filkov, "Rebuttal to Berger et al., TOPLAS 2019" (arXiv:1911.07393, not peer-reviewed).** "We find that Berger et al. largely replicated our results, and agree with us in their conclusion: that the effects (in a statistical sense) found in the data are small, and should be taken with caution, and that it is possible that an absence of effect is the correct interpretation."
- **Berger, Maj, O. Vitek, J. Vitek, "FSE/CACM Rebuttal²" (arXiv:1911.11894, not peer-reviewed).** "After data cleaning and statistical improvements, our analysis shows only one language with a positive association with errors (C++) and three with a negative association (Clojure, Haskell, and Ruby)."

**Verdict:** the Product Contract's "is contested" **is confirmed**: both sides agree any defect effect is small. Its "the testability argument is the stronger ground" is a judgement this pass did not test; P1 found no empirical study of testability, only design argument. **Correct the citation** with the DOIs above, and drop "cited from memory, unverified". The article number comes from a published bibliography (LIPIcs ECOOP 2021: "ACM Trans. Program. Lang. Syst., 41(4):21:1–21:24, 2019"); Crossref gives volume, issue and pages only.

---

## Open questions for U3 (Gonçalo's call)

- **P3 exceptions.** Should cohesion cost (Holub) or data too large to load first (Seemann) become marked exceptions to Math Quest 15? Each one widens what reviewers accept. Recommendation: neither in v1; a code-level exception (R14) already covers a real case.
- **P6 invariants.** Where does R2-style code enforce the invariants of a complex entity and keep business rules in one place? One option is constructor or validator functions that return plain data. This is the strongest form of the anemic-model objection, and U3 needs an answer before writing the R2 entry.
- **P1 performance exception.** Allow marked in-place updates for performance, as Math Quest 11 does for `shuffleInPlace`? Recommendation: yes, as a marked effect only.

## Gaps

- **No empirical study** was found for P2 or P3; P6 has one case study, against it.
- **No source** was found on injecting randomness for tests (P1).
- **No study splits agent performance by purity** (P7).
- Paywalled originals not read in full: Uesbeck 2016 and Nielebock 2019 (abstracts only); Wulf and Shaw 1973, "Global Variable Considered Harmful", and Dolado et al. 2003 on side effects and comprehension (no open copy found; not cited).
