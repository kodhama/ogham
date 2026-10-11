# Coding standard: sources

The sources the core's reasons cite, by the name used there. **Most are design arguments from practitioners, not measured results.** Where a source limits or disputes a rule, its line says so.

- **Bernhardt 2012.** Bernhardt, "Functional Core, Imperative Shell". <https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell>
- **Carmack 2012.** Carmack, "Functional Programming in C++". He also notes that pure functions copy more data, which can make them the wrong choice for performance. <https://www.gamedeveloper.com/programming/in-depth-functional-programming-in-c->
- **Cemus et al. 2016.** A case study in which an anemic domain model restated business rules in many places. One system; it disputes keeping data apart from behaviour. SOFSEM 2016, DOI 10.1007/978-3-662-49192-8_36. <https://cs.baylor.edu/~donahoo/papers/CCM%2B16.pdf>
- **Cockburn 2005.** Cockburn, "Hexagonal Architecture". <https://alistair.cockburn.us/hexagonal-architecture/>
- **Eyolfson and Lam 2019.** "How C++ Developers Use Immutability Declarations: An Empirical Study", ICSE 2019, DOI 10.1109/ICSE.2019.00050. It says best practice recommends immutability and that evidence on its uptake is lacking. <https://www.patricklam.ca/papers/19.icse.empirical-static-const.pdf>
- **Fowler 2003.** Fowler, "AnemicDomainModel". It disputes keeping data apart from behaviour. <https://martinfowler.com/bliki/AnemicDomainModel.html>
- **Fowler 2005.** Fowler, "CommandQuerySeparation". <https://martinfowler.com/bliki/CommandQuerySeparation.html>
- **Goetz 2022.** Goetz, "Data Oriented Programming in Java". He backs the split for plain data and keeps object-oriented techniques for complex entities. <https://www.infoq.com/articles/data-oriented-programming-java/>
- **Hickey 2011.** Hickey, "Simple Made Easy" (talk transcript). <https://raw.githubusercontent.com/matthiasn/talk-transcripts/master/Hickey_Rich/SimpleMadeEasy.md>
- **Holub 2020.** Holub, "Pure-Impure Segregation Principle". A limit: extracting pure code can cost cohesion. <https://tyrrrz.me/blog/pure-impure-segregation-principle>
- **Hughes 1990.** Hughes, "Why Functional Programming Matters". <https://www.cs.kent.ac.uk/people/staff/dat/miranda/whyfp90.pdf>
- **Meyer 2006.** Meyer, "Basic Eiffel language mechanisms". <https://se.inf.ethz.ch/~meyer/publications/online/eiffel/basic.html>
- **Nielebock et al. 2019.** "Programmers do not Favor Lambda Expressions for Concurrent Object-Oriented Code", Empirical Software Engineering, DOI 10.1007/s10664-018-9622-9. About concurrent Java, C# and C++ code. <https://2018.fseconference.org/details/fse-2018-Journal-First/12/Programmers-do-not-Favor-Lambda-Expressions-for-Concurrent-Object-Oriented-Code>
- **Oracle, `java.time.Clock`.** Java SE 8 API documentation. <https://docs.oracle.com/javase/8/docs/api/java/time/Clock.html>
- **Seemann 2015.** Seemann, "Functional design is intrinsically testable". <https://blog.ploeh.dk/2015/05/07/functional-design-is-intrinsically-testable/>
- **Seemann 2025.** Seemann, "Song recommendations from combinators". A limit: the pattern strains when the data is too large to load before deciding. <https://blog.ploeh.dk/2025/06/09/song-recommendations-from-combinators/>
- **Selby et al. 2007.** "Recovering Maintainability Effort in the Presence of Global Data Usage", WCRE 2007. It measures cross-module globals and how often files change, not defects. Two limits: file-scoped variables, the closest match to module-level state, are left out, and the authors note that frequent change may be a sign of growth, not of poor design. <https://cs.uwaterloo.ca/~mwg/files/wcre2007.pdf>
- **Swift API Design Guidelines.** <https://www.swift.org/documentation/api-design-guidelines/index.html>
