# Drawing conventions

Every diagram is plain Mermaid that Mermaid 11 can parse. Levels 1–3 use `flowchart` (not Mermaid's
experimental `C4Context` type: it lays out badly and Lucidchart and draw.io don't import it). Level 4
uses `classDiagram`. Keep to the classic syntax shown here, without the newer `@{ shape: … }` form, so
the imports into other tools keep working.

## Shared class definitions

Paste these at the bottom of every flowchart, then attach a class to each node with `:::`.

```
classDef person fill:#08427b,stroke:#052e56,color:#ffffff
classDef system fill:#1168bd,stroke:#0b4884,color:#ffffff
classDef container fill:#438dd5,stroke:#2e6295,color:#ffffff
classDef component fill:#85bbf0,stroke:#5d82a8,color:#000000
classDef external fill:#999999,stroke:#6b6b6b,color:#ffffff
```

## Boxes

- **Node IDs** are lowerCamelCase made from the element's name (`bookingApi`, `coachPerson`). Keep the
  same ID for the same thing on every level and every run. Never use a Mermaid keyword as an ID:
  `end`, `graph`, `flowchart`, `subgraph`, `class`, `classDef`, `style`, `click`, `default`.
- **Labels** always go in double quotes. Three parts, joined by `<br/>`:
  1. `<b>Name</b>`;
  2. the type in square brackets: `[Person]`, `[Software System]`, `[Container: Java 21 on AWS Lambda]`,
     `[Component: Spring service]`, `[Outside system: Stripe]`;
  3. one short line saying what it does, about 12 words at most.
- Inside a label, write a double quote as `#quot;`. Parentheses, colons and slashes are fine inside the
  quotes.
- **Shapes:** person `id(["…"])`, data store `id[("…")]`, queue or topic `id>"…"]`, everything else
  `id["…"]`.
- **Boundaries** are subgraphs with a dashed outline:
  ```
  subgraph sysBoundary["BladeBook [Software System]"]
    …
  end
  style sysBoundary fill:none,stroke:#888888,stroke-dasharray:5 5
  ```

## Arrows

- Every arrow has a label: what happens, then the technology in brackets where it's known.
  `api -->|"Reads and writes bookings<br/>[AWS SDK]"| table`
- Arrows show the direction of the request or of the data, whichever the documents describe. Don't
  draw both ways for one exchange.
- **Assumed** arrows are dotted: `api -.->|"Sends receipts? [assumed]"| email`

## Assumed boxes

Add a style line for each, with "?" at the end of its description line:

```
style emailSvc stroke:#d97706,stroke-width:2px,stroke-dasharray:6 4
```

Every dashed box and dotted arrow has a matching entry under `assumptions` in the manifest.

## Code and documents disagree

Draw what the code does. Flag every box and arrow involved with the mismatch's ID (`M1`, `M2`, ...) on
every diagram listed for it. The build fails if a listed diagram doesn't contain the ID.

- **A box:** add a last label line `<br/>⚠ Code differs from docs: M1` and a thick red outline:
  ```
  style cancelHandler stroke:#dc2626,stroke-width:4px
  ```
  If the box is also assumed, keep the dash and use the red: `stroke:#dc2626,stroke-width:4px,stroke-dasharray:6 4`.
- **An arrow:** draw it thick (`==>`) and end its label with `⚠ M1`:
  `api ==>|"Emails the coach on every cancel<br/>[SES] ⚠ M1"| ses`
- **Something the documents describe but the code doesn't have:** don't draw it as built. Flag the
  nearest box that the code does have (the container or component where it should live), and say
  in `codeDoes` that it's missing.

## Size and layout

- At most about 15 boxes per diagram. If a container has more components than that, group the small
  ones, or split it into two diagrams ("Booking API — booking", "Booking API — accounts").
- Use `flowchart TB` by default. Use `LR` when the arrows mostly flow one way across.
- Order the node definitions in the order you'd explain them: people first, then the system, then
  outside systems. Mermaid lays out in roughly that order.

## Example: level 1, system context

```
flowchart TB
  coach(["<b>Coach</b><br/>[Person]<br/>Posts lesson times and manages families"]):::person
  family(["<b>Family</b><br/>[Person]<br/>Books lessons for their skaters"]):::person
  app["<b>BladeBook</b><br/>[Software System]<br/>Lesson scheduling for skating coaches"]:::system
  cognito["<b>Amazon Cognito</b><br/>[Outside system]<br/>Sign-in and passwords"]:::external
  ses["<b>Amazon SES</b><br/>[Outside system]<br/>Sends email?"]:::external

  coach -->|"Manages schedule and families<br/>[HTTPS]"| app
  family -->|"Books and cancels lessons<br/>[HTTPS]"| app
  app -->|"Signs users in<br/>[OAuth 2.0]"| cognito
  app -.->|"Sends reminders? [assumed]"| ses
  style ses stroke:#d97706,stroke-width:2px,stroke-dasharray:6 4

  classDef person fill:#08427b,stroke:#052e56,color:#ffffff
  classDef system fill:#1168bd,stroke:#0b4884,color:#ffffff
  classDef container fill:#438dd5,stroke:#2e6295,color:#ffffff
  classDef component fill:#85bbf0,stroke:#5d82a8,color:#000000
  classDef external fill:#999999,stroke:#6b6b6b,color:#ffffff
```

## Example: level 2, containers

```
flowchart TB
  family(["<b>Family</b><br/>[Person]<br/>Books lessons for their skaters"]):::person

  subgraph sysBoundary["BladeBook [Software System]"]
    web["<b>Web app</b><br/>[Container: React SPA]<br/>Booking and account pages"]:::container
    api["<b>Booking API</b><br/>[Container: Java 21 on AWS Lambda]<br/>Bookings, schedules and accounts"]:::container
    table[("<b>Main table</b><br/>[Container: DynamoDB]<br/>Coaches, families, lessons")]:::container
  end
  style sysBoundary fill:none,stroke:#888888,stroke-dasharray:5 5

  cognito["<b>Amazon Cognito</b><br/>[Outside system]<br/>Sign-in and passwords"]:::external

  family -->|"Uses<br/>[HTTPS]"| web
  web -->|"Calls<br/>[JSON over HTTPS]"| api
  api -->|"Reads and writes<br/>[AWS SDK]"| table
  web -->|"Signs in<br/>[OAuth 2.0]"| cognito

  classDef person fill:#08427b,stroke:#052e56,color:#ffffff
  classDef system fill:#1168bd,stroke:#0b4884,color:#ffffff
  classDef container fill:#438dd5,stroke:#2e6295,color:#ffffff
  classDef component fill:#85bbf0,stroke:#5d82a8,color:#000000
  classDef external fill:#999999,stroke:#6b6b6b,color:#ffffff
```

## Level 3, components

The same as level 2, with the container as the dashed boundary and its components inside it
(`:::component`). Containers and outside systems it talks to sit outside the boundary, styled as
on level 2.

## Level 4, code

```
classDiagram
  direction LR
  class BookingService {
    +book(request) BookingResult
    +cancel(bookingId) void
  }
  class BookingRepository {
    <<interface>>
    +save(booking) void
    +findBySlot(slotId) Booking
  }
  class Booking {
    +String id
    +String slotId
    +Status status
  }
  BookingService --> BookingRepository : uses
  BookingRepository ..> Booking : stores
```

Show only the classes that matter for understanding the component: its entry points, the main
domain types and the interfaces between them. Show public members only, and only the important
ones. Don't draw getters, setters or framework boilerplate.
