import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { buildCodeGraph, impactGraph, sliceGraph } from "../index.ts";

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "code-graph-test-"));
	await mkdir(join(tempDir, "src"), { recursive: true });
	await mkdir(join(tempDir, "supabase/migrations"), { recursive: true });
	await mkdir(join(tempDir, "infra"), { recursive: true });
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

describe("buildCodeGraph", () => {
	test("indexes package scripts, imports, env vars, SQL, and IaC facts", async () => {
		await mkdir(join(tempDir, "src/generated"), { recursive: true });
		await mkdir(join(tempDir, "docs"), { recursive: true });
		await writeFile(
			join(tempDir, "package.json"),
			JSON.stringify({
				name: "fixture",
				scripts: {
					test: "bun test",
					codegen: "bun run tools/codegen.ts > src/generated/client.generated.ts",
					"db:types": "supabase gen types",
					"db:status": "supabase status",
					"db:reset": "supabase db reset",
					"db:drop": "supabase db drop",
					"db:seed": "supabase db seed",
				},
				dependencies: { zod: "1.0.0" },
			}),
		);
		await writeFile(
			join(tempDir, "src/index.ts"),
			[
				"import { helper } from './util';",
				"import { z } from 'zod';",
				"export function main() {",
				"  const client = { from: (name: string) => name, rpc: (name: string) => name };",
				"  return process.env.DATABASE_URL + ':' + process.env.DATABASE_URL_READONLY + ':' + helper() + ':' + z.string().parse('ok') + client.from('accounts') + client.rpc('hello_world');",
				"}",
			].join("\n"),
		);
		await writeFile(join(tempDir, "src/util.ts"), "export function helper() { return 'ok'; }\n");
		await writeFile(
			join(tempDir, "src/util.test.ts"),
			"import { helper } from './util';\ntest('helper', () => helper());\n",
		);
		await writeFile(join(tempDir, "src/generated/client.generated.ts"), "export const generated = true;\n");
		await writeFile(
			join(tempDir, "docs/guide.md"),
			"Read [the entrypoint](../src/index.ts) before editing `supabase/migrations/0001_init.sql`.\n",
		);
		await writeFile(
			join(tempDir, "supabase/migrations/0001_init.sql"),
			"create table public.organizations (id uuid primary key);\ncreate table public.accounts (id uuid primary key, organization_id uuid references public.organizations(id));\ncreate policy account_read on public.accounts for select using (true);\ncreate function public.hello_world() returns text language sql as $$ select 'hello' $$;\n",
		);
		await writeFile(join(tempDir, "infra/main.tf"), 'resource "aws_s3_bucket" "assets" {}\n');

		const graph = await buildCodeGraph({ root: tempDir, now: new Date("2026-05-11T00:00:00.000Z") });
		const tableImpact = impactGraph(graph, "dbtable:public.accounts");
		const tableSlice = sliceGraph(graph, "dbtable:public.accounts");
		const envSlice = sliceGraph(graph, "env:DATABASE_URL");
		const referencedTableImpact = impactGraph(graph, "dbtable:public.organizations");
		const shallowReferencedTableImpact = impactGraph(graph, "dbtable:public.organizations", { maxDepth: 1 });

		expect(graph.nodes.some((node) => node.id === "package:.")).toBe(true);
		expect(graph.nodes.some((node) => node.id === "script:.:test")).toBe(true);
		expect(graph.nodes.some((node) => node.id === "script:.:codegen")).toBe(true);
		expect(
			graph.edges.some(
				(edge) => edge.kind === "IMPORTS" && edge.from === "file:src/index.ts" && edge.to === "file:src/util.ts",
			),
		).toBe(true);
		expect(
			graph.edges.some(
				(edge) => edge.kind === "TESTS" && edge.from === "file:src/util.ts" && edge.to === "file:src/util.test.ts",
			),
		).toBe(true);
		expect(
			graph.edges.some(
				(edge) =>
					edge.kind === "GENERATED_BY" &&
					edge.from === "file:src/generated/client.generated.ts" &&
					edge.to === "script:.:codegen",
			),
		).toBe(true);
		expect(graph.nodes.some((node) => node.id === "env:DATABASE_URL")).toBe(true);
		expect(graph.nodes.some((node) => node.id === "env:DATABASE_URL_READONLY")).toBe(true);
		expect(graph.nodes.some((node) => node.id === "migration:supabase/migrations/0001_init.sql")).toBe(true);
		expect(graph.nodes.some((node) => node.id === "dbtable:public.accounts")).toBe(true);
		expect(graph.nodes.some((node) => node.id === "dbtable:public.organizations")).toBe(true);
		expect(graph.nodes.some((node) => node.id === "dbfunction:public.hello_world")).toBe(true);
		expect(
			graph.edges.some(
				(edge) =>
					edge.kind === "DOCUMENTS" &&
					edge.from === "file:docs/guide.md" &&
					edge.to === "file:src/index.ts",
			),
		).toBe(true);
		expect(
			graph.edges.some(
				(edge) =>
					edge.kind === "DOCUMENTS" &&
					edge.from === "file:docs/guide.md" &&
					edge.to === "file:supabase/migrations/0001_init.sql",
			),
		).toBe(true);
		expect(
			graph.edges.some(
				(edge) =>
					edge.kind === "CONFIGURES" &&
					edge.from === "file:supabase/migrations/0001_init.sql" &&
					edge.to === "migration:supabase/migrations/0001_init.sql",
			),
		).toBe(true);
		expect(
			graph.edges.some(
				(edge) =>
					edge.kind === "MIGRATION_CREATES" &&
					edge.from === "migration:supabase/migrations/0001_init.sql" &&
					edge.to === "dbtable:public.accounts",
			),
		).toBe(true);
		expect(
			graph.edges.some(
				(edge) =>
					edge.kind === "SERVICE_QUERIES_TABLE" &&
					edge.from === "file:src/index.ts" &&
					edge.to === "dbtable:public.accounts",
			),
		).toBe(true);
		expect(
			graph.edges.some(
				(edge) =>
					edge.kind === "SERVICE_CALLS_RPC" &&
					edge.from === "file:src/index.ts" &&
					edge.to === "dbfunction:public.hello_world",
			),
		).toBe(true);
		expect(
			graph.edges.some(
				(edge) =>
					edge.kind === "TABLE_REFERENCES_TABLE" &&
					edge.from === "dbtable:public.accounts" &&
					edge.to === "dbtable:public.organizations",
			),
		).toBe(true);
		expect(tableImpact.nodes.some((node) => node.id === "file:src/index.ts")).toBe(true);
		expect(tableImpact.nodes.some((node) => node.id === "script:.:db:types")).toBe(true);
		expect(tableImpact.nodes.some((node) => node.id === "script:.:db:status")).toBe(true);
		expect(tableImpact.nodes.some((node) => node.id === "script:.:db:reset")).toBe(false);
		expect(tableImpact.nodes.some((node) => node.id === "script:.:db:drop")).toBe(false);
		expect(tableImpact.nodes.some((node) => node.id === "script:.:db:seed")).toBe(false);
		expect(tableSlice.nodes.some((node) => node.id === "dbtable:public.accounts")).toBe(true);
		expect(tableSlice.nodes.some((node) => node.id === "script:.:db:types")).toBe(true);
		expect(tableSlice.summary?.validationCommands.map((command) => command.name)).toContain("db:types");
		expect(envSlice.nodes.some((node) => node.id === "env:DATABASE_URL")).toBe(true);
		expect(envSlice.nodes.some((node) => node.id === "env:DATABASE_URL_READONLY")).toBe(false);
		expect(envSlice.nodes.some((node) => node.id === "file:src/index.ts")).toBe(true);
		expect(referencedTableImpact.nodes.some((node) => node.id === "dbtable:public.accounts")).toBe(true);
		expect(shallowReferencedTableImpact.nodes.some((node) => node.id === "dbtable:public.accounts")).toBe(true);
		expect(shallowReferencedTableImpact.nodes.some((node) => node.id === "file:src/index.ts")).toBe(false);
		expect(graph.nodes.some((node) => node.id === "iacresource:aws_s3_bucket:assets")).toBe(true);
		expect(graph.manifest.totals.files).toBe(8);
	});

	test("does not treat built-in from calls as Supabase table usage", async () => {
		await writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "fixture" }));
		await writeFile(join(tempDir, "src/index.ts"), "export const accounts = Array.from('accounts');\n");
		await writeFile(
			join(tempDir, "supabase/migrations/0001_init.sql"),
			"create table public.accounts (id uuid primary key);\n",
		);

		const graph = await buildCodeGraph({ root: tempDir });

		expect(
			graph.edges.some(
				(edge) =>
					edge.kind === "SERVICE_QUERIES_TABLE" &&
					edge.from === "file:src/index.ts" &&
					edge.to === "dbtable:public.accounts",
			),
		).toBe(false);
	});

	test("keeps type-only imports out of runtime import edges", async () => {
		await writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "fixture" }));
		await writeFile(join(tempDir, "src/types.ts"), "export type Value = string;\n");
		await writeFile(
			join(tempDir, "src/index.ts"),
			[
				"import type { Value } from './types';",
				"export type { Value } from './types';",
				"export const value: Value = 'ok';",
			].join("\n"),
		);

		const graph = await buildCodeGraph({ root: tempDir });
		const typeEdges = graph.edges.filter(
			(edge) => edge.from === "file:src/index.ts" && edge.to === "file:src/types.ts",
		);

		expect(typeEdges.map((edge) => edge.kind)).toEqual(["TYPE_IMPORTS"]);
	});

	test("resolves local Python imports to files and keeps the rest external", async () => {
		await mkdir(join(tempDir, "scripts/lib"), { recursive: true });
		await mkdir(join(tempDir, "app/pkg"), { recursive: true });
		await writeFile(join(tempDir, "scripts/lib/helper.py"), "VALUE = 1\n");
		await writeFile(
			join(tempDir, "scripts/lib/tool.py"),
			["import os, sys", "import helper as h", "import missing_pkg", "from helper import VALUE"].join("\n"),
		);
		await writeFile(join(tempDir, "app/__init__.py"), "");
		await writeFile(join(tempDir, "app/pkg/__init__.py"), "");
		await writeFile(join(tempDir, "app/pkg/util.py"), "def f(): pass\n");
		await writeFile(join(tempDir, "app/pkg/mod.py"), "from . import util\nfrom .. import pkg\n");
		await writeFile(join(tempDir, "app/main.py"), "from app.pkg import util\nfrom .nowhere import x\n");

		const graph = await buildCodeGraph({ root: tempDir });
		const importsFrom = (from: string) =>
			graph.edges
				.filter((edge) => edge.kind === "IMPORTS" && edge.from === from)
				.map((edge) => edge.to)
				.sort();

		expect(importsFrom("file:scripts/lib/tool.py")).toEqual([
			"external:missing_pkg",
			"external:os",
			"external:sys",
			"file:scripts/lib/helper.py",
		]);
		expect(importsFrom("file:app/pkg/mod.py")).toEqual(["file:app/pkg/__init__.py", "file:app/pkg/util.py"]);
		expect(importsFrom("file:app/main.py")).toEqual(["file:app/pkg/__init__.py", "file:app/pkg/util.py"]);
	});

	test("infers TESTS edges from colocated __tests__ naming conventions", async () => {
		await mkdir(join(tempDir, "src/core/harness"), { recursive: true });
		await mkdir(join(tempDir, "src/core/__tests__"), { recursive: true });
		await writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "fixture", scripts: { test: "bun test" } }));
		await writeFile(join(tempDir, "src/core/harness/tool-packs.ts"), "export const toolPacks = true;\n");
		await writeFile(
			join(tempDir, "src/core/__tests__/harness-tool-packs.test.ts"),
			"import { test, expect } from 'bun:test';\ntest('tool packs', () => expect(true).toBe(true));\n",
		);

		const graph = await buildCodeGraph({ root: tempDir, now: new Date("2026-05-11T00:00:00.000Z") });
		const impact = impactGraph(graph, "src/core/harness/tool-packs.ts");

		expect(
			graph.edges.some(
				(edge) =>
					edge.kind === "TESTS" &&
					edge.from === "file:src/core/harness/tool-packs.ts" &&
					edge.to === "file:src/core/__tests__/harness-tool-packs.test.ts",
			),
		).toBe(true);
		expect(impact.nodes.some((node) => node.id === "file:src/core/__tests__/harness-tool-packs.test.ts")).toBe(true);
		expect(impact.summary?.validationCommands).toContainEqual({
			packageId: "package:.",
			scriptId: "script:.:test#src/core/__tests__/harness-tool-packs.test.ts",
			name: "test:src/core/__tests__/harness-tool-packs.test.ts",
			command: "bun test ./src/core/__tests__/harness-tool-packs.test.ts",
			runCommand: "bun test ./src/core/__tests__/harness-tool-packs.test.ts",
			path: "package.json",
		});
	});

	test("links Terraform resource and module dependencies", async () => {
		await writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "fixture" }));
		await writeFile(
			join(tempDir, "infra/main.tf"),
			[
				'resource "aws_s3_bucket" "assets" {}',
				'resource "aws_cloudfront_distribution" "cdn" {',
				"  origin {",
				"    domain_name = aws_s3_bucket.assets.bucket_regional_domain_name",
				"  }",
				"  depends_on = [aws_s3_bucket.assets]",
				"}",
				'module "cdn" {',
				'  source = "./modules/aws_cloudfront_distribution.cdn"',
				"  bucket_id = aws_s3_bucket.assets.id",
				"}",
			].join("\n"),
		);

		const graph = await buildCodeGraph({ root: tempDir });
		const bucketImpact = impactGraph(graph, "iacresource:aws_s3_bucket:assets");
		const moduleBucketEdge = graph.edges.find(
			(edge) =>
				edge.kind === "RESOURCE_DEPENDS_ON" &&
				edge.from === "iacmodule:module:cdn" &&
				edge.to === "iacresource:aws_s3_bucket:assets",
		);

		expect(
			graph.edges.some(
				(edge) =>
					edge.kind === "RESOURCE_DEPENDS_ON" &&
					edge.from === "iacresource:aws_cloudfront_distribution:cdn" &&
					edge.to === "iacresource:aws_s3_bucket:assets",
			),
		).toBe(true);
		expect(moduleBucketEdge).toMatchObject({
			label: "aws_s3_bucket.assets",
			provenance: {
				source: "iac-parser",
				evidence: [{ path: "infra/main.tf", startLine: 10, endLine: 10 }],
			},
		});
		expect(
			graph.edges.some(
				(edge) =>
					edge.kind === "RESOURCE_DEPENDS_ON" &&
					edge.from === "iacmodule:module:cdn" &&
					edge.to === "iacresource:aws_cloudfront_distribution:cdn",
			),
		).toBe(false);
		expect(bucketImpact.nodes.some((node) => node.id === "iacresource:aws_cloudfront_distribution:cdn")).toBe(true);
		expect(bucketImpact.nodes.some((node) => node.id === "iacmodule:module:cdn")).toBe(true);
	});

	test("indexes GitHub Actions validation and deployment tasks", async () => {
		await mkdir(join(tempDir, ".github/workflows"), { recursive: true });
		await writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "fixture" }));
		await writeFile(
			join(tempDir, ".github/workflows/ci.yml"),
			[
				"name: CI",
				"on: [push]",
				"jobs:",
				"  verify:",
				"    name: Verify",
				"    runs-on: ubuntu-latest",
				"    steps:",
				"      - uses: actions/checkout@v4",
				"      - name: Typecheck",
				"        run: bun run typecheck",
				"      - name: Test and lint",
				"        run: |",
				"          bun test",
				"          bun run lint",
				"  deploy:",
				"    runs-on: ubuntu-latest",
				"    steps:",
				"      - name: Deploy app",
				"        run: fly deploy",
			].join("\n"),
		);

		const graph = await buildCodeGraph({ root: tempDir });
		const workflowSlice = sliceGraph(graph, "config:ci:.github/workflows/ci.yml");
		const typecheckNode = graph.nodes.find(
			(node) => node.id === "config:ci:.github/workflows/ci.yml:job:verify:run:1",
		);
		const multilineNode = graph.nodes.find(
			(node) => node.id === "config:ci:.github/workflows/ci.yml:job:verify:run:2",
		);
		const deployNode = graph.nodes.find(
			(node) => node.id === "config:ci:.github/workflows/ci.yml:job:deploy:run:1",
		);

		expect(graph.nodes.some((node) => node.id === "config:ci:.github/workflows/ci.yml")).toBe(true);
		expect(graph.nodes.some((node) => node.id === "config:ci:.github/workflows/ci.yml:job:verify")).toBe(true);
		expect(typecheckNode).toMatchObject({
			kind: "CiRunStep",
			label: "Typecheck",
			metadata: {
				workflowFactKind: "run",
				taskKind: "validation",
				command: "bun run typecheck",
			},
		});
		expect(multilineNode?.metadata["command"]).toBe("bun test\nbun run lint");
		expect(deployNode?.metadata["taskKind"]).toBe("deployment");
		expect(
			graph.edges.some(
				(edge) =>
					edge.kind === "CONFIGURES" &&
					edge.from === "file:.github/workflows/ci.yml" &&
					edge.to === "config:ci:.github/workflows/ci.yml",
			),
		).toBe(true);
		expect(
			graph.edges.some(
				(edge) =>
					edge.kind === "CONFIGURES" &&
					edge.from === "config:ci:.github/workflows/ci.yml" &&
					edge.to === "config:ci:.github/workflows/ci.yml:job:verify",
			),
		).toBe(true);
		expect(
			graph.edges.some(
				(edge) =>
					edge.kind === "CONFIGURES" &&
					edge.from === "config:ci:.github/workflows/ci.yml:job:verify" &&
					edge.to === "config:ci:.github/workflows/ci.yml:job:verify:run:1",
			),
		).toBe(true);
		expect(workflowSlice.nodes.some((node) => node.id === "config:ci:.github/workflows/ci.yml:job:deploy:run:1")).toBe(
			true,
		);
		expect(graph.findings).toEqual([]);
	});

	test("creates bounded slices and impact views", async () => {
		await writeFile(
			join(tempDir, "package.json"),
			JSON.stringify({
				name: "fixture",
				scripts: {
					dev: "bun --watch src/index.ts",
					build: "bun build src/index.ts",
					lint: "eslint src",
					"typecheck:web": "tsc --noEmit",
					"test:unit": "bun test",
					"db:types": "supabase gen types",
					"db:reset": "supabase db reset",
					preview: "vite preview",
					postinstall: "lefthook install",
				},
			}),
		);
		await writeFile(join(tempDir, "src/index.ts"), "import { helper } from './util';\nhelper();\n");
		await writeFile(join(tempDir, "src/util.ts"), "export function helper() { return 'ok'; }\n");

		const graph = await buildCodeGraph({ root: tempDir });
		const slice = sliceGraph(graph, "path:src/index.ts");
		const impact = impactGraph(graph, "src/util.ts");
		const directOnlyImpact = impactGraph(graph, "src/util.ts", { maxDepth: 0 });

		expect(slice.nodes.some((node) => node.id === "file:src/index.ts")).toBe(true);
		expect(slice.nodes.some((node) => node.id === "file:src/util.ts")).toBe(true);
		expect(slice.nodes.some((node) => node.id === "package:.")).toBe(true);
		expect(slice.nodes.some((node) => node.id === "script:.:build")).toBe(true);
		expect(slice.nodes.some((node) => node.id === "script:.:typecheck:web")).toBe(true);
		expect(slice.nodes.some((node) => node.id === "script:.:test:unit")).toBe(true);
		expect(slice.nodes.some((node) => node.id === "script:.:db:types")).toBe(false);
		expect(slice.nodes.some((node) => node.id === "script:.:db:reset")).toBe(false);
		expect(slice.nodes.some((node) => node.id === "script:.:dev")).toBe(false);
		expect(slice.nodes.some((node) => node.id === "script:.:preview")).toBe(false);
		expect(slice.nodes.some((node) => node.id === "script:.:postinstall")).toBe(false);
		expect(slice.summary?.affectedPackages[0]?.packageId).toBe("package:.");
		expect(slice.summary?.affectedPackages[0]?.directNodeCount).toBeGreaterThan(0);
		expect(slice.summary?.validationCommands.map((command) => command.name)).toContain("build");
		expect(slice.summary?.validationCommands.map((command) => command.name)).toContain("typecheck:web");
		expect(slice.summary?.validationCommands.map((command) => command.name)).not.toContain("dev");
		expect(slice.summary?.validationCommands.map((command) => command.name)).not.toContain("db:reset");
		expect(slice.summary?.validationCommands).toContainEqual({
			packageId: "package:.",
			scriptId: "script:.:typecheck:web",
			name: "typecheck:web",
			command: "tsc --noEmit",
			runCommand: "bun run typecheck:web",
			path: "package.json",
		});
		expect(impact.nodes.some((node) => node.id === "file:src/index.ts")).toBe(true);
		expect(impact.nodes.some((node) => node.id === "package:.")).toBe(true);
		expect(directOnlyImpact.nodes.some((node) => node.id === "file:src/index.ts")).toBe(false);
	});

	test("includes tests for impacted dependents in bounded impact views", async () => {
		await writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "fixture", scripts: { test: "bun test" } }));
		await writeFile(join(tempDir, "src/types.ts"), "export const valueKind = 'ok';\n");
		await writeFile(
			join(tempDir, "src/index.ts"),
			"import { valueKind } from './types';\nexport const value = valueKind;\n",
		);
		await writeFile(
			join(tempDir, "src/index.test.ts"),
			"import { value } from './index';\ntest('value', () => value);\n",
		);

		const graph = await buildCodeGraph({ root: tempDir });
		const impact = impactGraph(graph, "src/types.ts", { maxDepth: 1 });

		expect(impact.nodes.some((node) => node.id === "file:src/index.ts")).toBe(true);
		expect(impact.nodes.some((node) => node.id === "file:src/index.test.ts")).toBe(true);
		expect(impact.summary?.validationCommands).toContainEqual({
			packageId: "package:.",
			scriptId: "script:.:test#src/index.test.ts",
			name: "test:src/index.test.ts",
			command: "bun test ./src/index.test.ts",
			runCommand: "bun test ./src/index.test.ts",
			path: "package.json",
		});
	});

	test("emits pasteable Bun path arguments for focused tests outside src", async () => {
		await mkdir(join(tempDir, "tests/e2e"), { recursive: true });
		await writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "fixture", scripts: { test: "bun test" } }));
		await writeFile(join(tempDir, "src/index.ts"), "export const value = 'ok';\n");
		await writeFile(
			join(tempDir, "tests/e2e/index.test.ts"),
			"import { value } from '../../src/index';\ntest('value', () => value);\n",
		);

		const graph = await buildCodeGraph({ root: tempDir });
		const impact = impactGraph(graph, "src/index.ts", { maxDepth: 1 });

		expect(impact.summary?.validationCommands).toContainEqual({
			packageId: "package:.",
			scriptId: "script:.:test#tests/e2e/index.test.ts",
			name: "test:tests/e2e/index.test.ts",
			command: "bun test ./tests/e2e/index.test.ts",
			runCommand: "bun test ./tests/e2e/index.test.ts",
			path: "package.json",
		});
	});

	test("adds focused root scripts for nested monorepo package slices", async () => {
		await mkdir(join(tempDir, "apps/web/src"), { recursive: true });
		await writeFile(
			join(tempDir, "package.json"),
			JSON.stringify({
				name: "workspace",
				scripts: {
					dev: "bun run dev:web",
					build: "bun run build:web && bun run build:api",
					"build:web": "cd apps/web && bun run build",
					"build:api": "cd apps/api && bun run build",
					lint: "bun run lint:web && bun run lint:api",
					"lint:web": "cd apps/web && bun run lint",
					"lint:api": "cd apps/api && bun run lint",
					typecheck: "bun run typecheck:web && bun run typecheck:api",
					"typecheck:web": "cd apps/web && bun run typecheck",
					test: "bun test",
					"typecheck:api": "cd apps/api && bun run typecheck",
					"db:types": "supabase gen types",
					"db:reset": "supabase db reset",
					postinstall: "lefthook install",
				},
			}),
		);
		await writeFile(
			join(tempDir, "apps/web/package.json"),
			JSON.stringify({
				name: "@fixture/web",
				scripts: {
					dev: "vite",
					build: "vite build",
					typecheck: "tsc --noEmit",
					test: "bun test",
				},
			}),
		);
		await writeFile(join(tempDir, "apps/web/src/index.ts"), "export const page = 'web';\n");
		await writeFile(
			join(tempDir, "apps/web/src/index.test.ts"),
			"import { page } from './index';\ntest('page', () => page);\n",
		);

		const graph = await buildCodeGraph({ root: tempDir });
		const slice = sliceGraph(graph, "path:apps/web/src/index.ts");

		expect(slice.nodes.some((node) => node.id === "package:.")).toBe(true);
		expect(slice.nodes.some((node) => node.id === "package:apps/web")).toBe(true);
		expect(slice.nodes.some((node) => node.id === "script:apps/web:build")).toBe(true);
		expect(slice.nodes.some((node) => node.id === "script:apps/web:typecheck")).toBe(true);
		expect(slice.nodes.some((node) => node.id === "script:apps/web:dev")).toBe(false);
		expect(slice.nodes.some((node) => node.id === "script:.:build")).toBe(true);
		expect(slice.nodes.some((node) => node.id === "script:.:build:web")).toBe(true);
		expect(slice.nodes.some((node) => node.id === "script:.:build:api")).toBe(false);
		expect(slice.nodes.some((node) => node.id === "script:.:typecheck")).toBe(true);
		expect(slice.nodes.some((node) => node.id === "script:.:typecheck:web")).toBe(true);
		expect(slice.nodes.some((node) => node.id === "script:.:typecheck:api")).toBe(false);
		expect(slice.nodes.some((node) => node.id === "script:.:db:types")).toBe(false);
		expect(slice.nodes.some((node) => node.id === "script:.:db:reset")).toBe(false);
		expect(slice.summary?.affectedPackages.map((summary) => summary.packageId)).toEqual([
			"package:apps/web",
			"package:.",
		]);
		expect(slice.summary?.validationCommands.map((command) => command.name)).toEqual([
			"test:apps/web/src/index.test.ts",
			"test:apps/web/src",
			"build",
			"typecheck",
			"test",
			"build",
			"build:web",
			"lint",
			"lint:web",
			"typecheck",
			"typecheck:web",
			"test",
		]);
		expect(slice.summary?.validationCommands).toContainEqual({
			packageId: "package:apps/web",
			scriptId: "script:apps/web:test#apps/web/src/index.test.ts",
			name: "test:apps/web/src/index.test.ts",
			command: "cd apps/web && bun test ./src/index.test.ts",
			runCommand: "cd apps/web && bun test ./src/index.test.ts",
			path: "apps/web/package.json",
		});
		expect(slice.summary?.validationCommands).toContainEqual({
			packageId: "package:apps/web",
			scriptId: "script:apps/web:test#apps/web/src",
			name: "test:apps/web/src",
			command: "cd apps/web && bun test ./src",
			runCommand: "cd apps/web && bun test ./src",
			path: "apps/web/package.json",
		});
		expect(slice.summary?.validationCommands).toContainEqual({
			packageId: "package:apps/web",
			scriptId: "script:apps/web:typecheck",
			name: "typecheck",
			command: "tsc --noEmit",
			runCommand: "cd apps/web && bun run typecheck",
			path: "apps/web/package.json",
		});
		expect(slice.summary?.validationCommands).toContainEqual({
			packageId: "package:.",
			scriptId: "script:.:typecheck:web",
			name: "typecheck:web",
			command: "cd apps/web && bun run typecheck",
			runCommand: "bun run typecheck:web",
			path: "package.json",
		});
	});

	test("links local workspace package dependencies by package name", async () => {
		await mkdir(join(tempDir, "apps/web/src"), { recursive: true });
		await mkdir(join(tempDir, "packages/shared"), { recursive: true });
		await mkdir(join(tempDir, "apps/web"), { recursive: true });
		await writeFile(
			join(tempDir, "package.json"),
			JSON.stringify({
				name: "workspace",
				workspaces: ["packages/*", "apps/*"],
				scripts: { typecheck: "bun run typecheck:web", "typecheck:web": "cd apps/web && bun run typecheck" },
			}),
		);
		await writeFile(
			join(tempDir, "packages/shared/package.json"),
			JSON.stringify({
				name: "@fixture/shared",
				scripts: { typecheck: "tsc --noEmit" },
			}),
		);
		await writeFile(
			join(tempDir, "apps/web/package.json"),
			JSON.stringify({
				name: "@fixture/web",
				dependencies: { "@fixture/shared": "workspace:*", react: "19.0.0" },
				devDependencies: { "@types/react": "19.0.0" },
				scripts: { typecheck: "tsc --noEmit" },
			}),
		);
		await writeFile(
			join(tempDir, "apps/web/src/index.ts"),
			"import { shared } from '@fixture/shared';\nexport const web = shared;\n",
		);

		const graph = await buildCodeGraph({ root: tempDir });
		const impact = impactGraph(graph, "package:packages/shared", { maxDepth: 1 });

		expect(
			graph.edges.some(
				(edge) =>
					edge.kind === "DEPENDS_ON" &&
					edge.from === "package:apps/web" &&
					edge.to === "package:packages/shared" &&
					edge.label === "dependencies:@fixture/shared",
			),
		).toBe(true);
		expect(graph.edges.some((edge) => edge.kind === "DEPENDS_ON" && edge.to === "external:react")).toBe(false);
		expect(
			graph.edges.some(
				(edge) =>
					edge.kind === "IMPORTS" &&
					edge.from === "file:apps/web/src/index.ts" &&
					edge.to === "package:packages/shared" &&
					edge.label === "@fixture/shared",
			),
		).toBe(true);
		expect(graph.nodes.some((node) => node.id === "external:@fixture/shared")).toBe(false);
		expect(impact.nodes.some((node) => node.id === "package:apps/web")).toBe(true);
		expect(impact.nodes.some((node) => node.id === "script:apps/web:typecheck")).toBe(true);
		expect(impact.summary?.affectedPackages.map((summary) => summary.packageId)).toContain("package:apps/web");
	});

	test("keeps package selectors from matching prefix sibling packages", async () => {
		await mkdir(join(tempDir, "apps/web/src"), { recursive: true });
		await mkdir(join(tempDir, "apps/web-admin/src"), { recursive: true });
		await writeFile(
			join(tempDir, "package.json"),
			JSON.stringify({ name: "workspace", workspaces: ["apps/*"], scripts: { test: "bun test" } }),
		);
		await writeFile(join(tempDir, "apps/web/package.json"), JSON.stringify({ name: "@fixture/web" }));
		await writeFile(join(tempDir, "apps/web-admin/package.json"), JSON.stringify({ name: "@fixture/web-admin" }));
		await writeFile(join(tempDir, "apps/web/src/index.ts"), "export const web = true;\n");
		await writeFile(join(tempDir, "apps/web-admin/src/index.ts"), "export const admin = true;\n");

		const graph = await buildCodeGraph({ root: tempDir });
		const sliceByPath = sliceGraph(graph, "package:apps/web");
		const sliceByName = sliceGraph(graph, "package:@fixture/web");

		for (const slice of [sliceByPath, sliceByName]) {
			expect(slice.nodes.some((node) => node.id === "package:apps/web")).toBe(true);
			expect(slice.nodes.some((node) => node.id === "file:apps/web/src/index.ts")).toBe(true);
			expect(slice.nodes.some((node) => node.id === "package:apps/web-admin")).toBe(false);
			expect(slice.nodes.some((node) => node.id === "file:apps/web-admin/src/index.ts")).toBe(false);
		}
	});
});
