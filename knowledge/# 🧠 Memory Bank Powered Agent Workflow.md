# 🧠 Memory Bank Powered Agent Workflow

This document specifies a **declarative workflow system in Markdown** for Copilot/LLM agents to follow when executing company-specific tasks like **.NET → Spring Boot conversion**, **new project scaffolding**, or **framework migration**.

---

## 🚧 The Missing Pieces (Solved)

1. **Tiny DSL in Markdown** — add machine-readable YAML + fenced code blocks.
2. **State & Resume** — persist `run-state.json` per workflow.
3. **Guardrails** — allowlists, dry-run, PR flow.
4. **Standard Extractors** — produce stable outputs like `entities.yaml`, `apis.yaml`.
5. **Mappings & Linters** — equivalence maps and best practices checks.
6. **Company Packs** — pluggable configs for Moneta Boot, CI/CD, SSO, Docker.
7. **Idempotence** — every step has `success_when:` conditions.
8. **Artifacts** — logs and plans stored in `/artifacts/<workflow-id>/`.

---

## 🗂️ Repository Layout

```
memory-bank/
  catalog.md
  engine/
    toolbox.md
    policies.md
    templates/
  maps/
    dotnet-to-spring.yaml
    angular-to-react.yaml
  linters/
    spring-boot-best-practices.md
    react-best-practices.md
  packs/
    moneta-boot/
      readme.md
      sso-okta.md
      cicd-jules.md
      docker-multistage.md
      postgres-jpa.md
  workflows/
    dotnet-to-springboot/
      workflow.md
      extractors.md
      validators.md
    springboot-new/
      workflow.md
    angular-to-react/
      workflow.md
      codemods.md
    react-mui-new/
      workflow.md
```

---

## 📚 `catalog.md` (User Menu)

```markdown
# 📚 Memory Bank — Catalog

Pick a workflow:

1. [.NET → Spring Boot](workflows/dotnet-to-springboot/workflow.md)
2. [New Spring Boot App](workflows/springboot-new/workflow.md)
3. [Angular → React](workflows/angular-to-react/workflow.md)
4. [New React + Material UI](workflows/react-mui-new/workflow.md)

> Say: **"load memory bank"** to see this menu anytime.
```

---

## 🧩 Workflow DSL Schema

````markdown
```workflow-schema
step:
  id: string
  title: string
  ask?:               # user questions → saved to run-state
    - id: string
      prompt: string
      type: select|text|path|bool|multi
      options?: [..]
      save_as: string
      required: bool
  use?:               # tools invoked from engine/toolbox.md
    - tool: string
      with: object
  vars?:              # derived variables
    name: "{{ expression }}"
  success_when?:      # checkpoint conditions
    - kind: exists|matches|count|command_succeeds
      target: "path-or-glob"
      expect: "value/regex"
  on_success?: goto|finish
  on_failure?: goto|ask_for_help|abort
````

````

---

## 🧠 Toolbox (`engine/toolbox.md`)

```markdown
## Tools
- git.clone(repo, dest)
- git.branch(name), git.commit(msg), git.create_pr(title, body)
- fs.scan(path, globs), fs.copy(src, dst), fs.write(path, content), fs.diff(path)
- code.search(path, pattern), code.parse_dotnet(path), code.parse_java(path)
- llm.summarize(text, style), llm.transform(mapping, input)
- spring.init(name, groupId, artifactId, template), spring.add_dependency(pom.xml, dep)
- docker.writefile(path, template), cicd.apply(template, params)
- test.run(mvn/gradle), react.init(name), react.add_mui(), angular.parse(), codemod.apply(set)

## Conventions
- **Dry-run by default** (until plan approval).
- All code writes → branch `feat/{{workflowId}}`.
````

---

## ✅ Example Workflow: .NET → Spring Boot

Located at `workflows/dotnet-to-springboot/workflow.md`.

Covers:

* Source acquisition (workspace/git/bitbucket/local).
* Extraction of business knowledge → `/docs/business-knowledge/`.
* Gap analysis via `maps/dotnet-to-spring.yaml`.
* Target project selection (new vs. integrate).
* Spring Boot scaffolding.
* Conversion plan generation → `ConversionPlan.md`.
* User approval checkpoint.
* Code conversion (entities, repos, services, controllers).
* Dependency, Docker, CI/CD setup.
* Linting & test validation.
* PR creation.

(*See full detailed steps in workflow spec — each step uses the DSL defined above.*)

---

## 🧪 Standard Extractors

```markdown
# Extractors (dotnet-to-springboot)

- Controllers → `docs/business-knowledge/apis.yaml`
- Services → `docs/business-knowledge/services.md`
- Entities → `docs/business-knowledge/entities.yaml`
- Config → `docs/business-knowledge/config.md`
```

---

## 🧭 Mappings

`maps/dotnet-to-spring.yaml`

```yaml
packages:
  "Microsoft.AspNetCore.App": ["spring-boot-starter-web"]
  "Microsoft.Extensions.Logging": ["spring-boot-starter-logging"]
  "Swashbuckle.AspNetCore": ["springdoc-openapi-starter-webmvc-ui"]

idioms:
  controller_attribute:
    from: "[ApiController]"
    to: "@RestController"
  route_attribute:
    from: "[Route(\"/api/{name}\")]"
    to: "@RequestMapping(\"/api/{name}\")"

data_access:
  orm_from: "EntityFramework"
  orm_to: "JPA/Hibernate"
  repo_pattern: "Spring Data JPA"
```

---

## 🔐 Guardrails

* **Dry-run** until plan approved.
* **Allowlist paths** (no writes outside workspace).
* **Secrets scan** cloned repos.
* **License checks** for external libs.
* **Rate limits** and **timeouts**.

---

## 🔄 Engine Behavior

1. Parse `workflow.md`.
2. Merge `includes:` packs.
3. Load/persist `run-state.json`.
4. Execute steps → ask questions, compute vars, run tools, verify conditions.
5. Log + artifact write per step.
6. Exit on `finish`, `abort`, or cancel.

---

## ✨ Out-of-the-box Boosters

* **Gap Analysis**: NuGet → Maven, plus architectural features.
* **Mermaid graphs**: show dependencies visually.
* **Impact Matrix**: map .NET endpoints → generated Java + tests.
* **Best practices linting** from linters folder.
* **SBOM + SCA scans**.
* **Effort estimate** (#files, complexity buckets).
* **Drift guard** if repo changes mid-run.
* **Multi-repo discovery**.

---

## 📚 Other Workflows (Stubs)

* **Spring Boot New App** → `workflows/springboot-new/workflow.md` (inputs: service name, db, sso, packs).
* **Angular → React** → `workflows/angular-to-react/workflow.md` (parse Angular, codemods, scaffold React, apply UI libs).
* **React + MUI New** → `workflows/react-mui-new/workflow.md` (simple: init React, add MUI).

---

## 📝 UX Flow

* **Welcome screen** → from `catalog.md`.
* **Interactive questions** → from each step’s `ask:`.
* **Conversion plan** → `ConversionPlan.md` shown before writes.
* **Resume** → pick up from last checkpoint if `run-state.json` exists.

---

## 🎯 Bottom Line

This Memory Bank design works if you:

* Treat `.md` as **workflow DSL**.
* Standardize **extractors/mappings**.
* Enforce **guardrails**.
* Persist **state + artifacts**.

It allows **any existing agent** (Copilot, Windsurf, LangChain) to run these workflows — **no custom agent development required** unless you want extra orchestration or retrieval logic.
