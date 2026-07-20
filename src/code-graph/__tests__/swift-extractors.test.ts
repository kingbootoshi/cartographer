import { describe, expect, test } from "bun:test";
import type { InventoryFile } from "../inventory.ts";
import { extractImports, extractSymbols } from "../extractors.ts";

const SWIFT_FIXTURE = `//
//  ItemViewModel.swift
//

import Foundation
import Combine
@preconcurrency import CoreData
@testable import SampleApp
import class UIKit.UIImage

// class Commented out — must not match
protocol Refreshable {
    func refresh(id: Int)
}

public final class ItemViewModel: NSObject, Refreshable {
    private struct Constants {
        static let retryLimit = 3
    }

    enum State: Equatable {
        case idle
        case loading
    }

    typealias Completion = (Bool) -> Void

    class func shared() -> ItemViewModel { ItemViewModel() }

    private var attempts = 0

    func refresh(id: Int) {
    }

    private func retry() {
    }
}

actor Cache {
}

fileprivate struct HiddenHelper {
}
`;

function swiftFile(path: string): InventoryFile {
	return {
		path,
		absolutePath: `/tmp/${path}`,
		sizeBytes: SWIFT_FIXTURE.length,
		hash: "test",
		lineCount: SWIFT_FIXTURE.split("\n").length,
		kind: "source",
		readableText: true,
		gitStatus: "tracked",
	};
}

describe("swift extractors", () => {
	test("extracts module imports as external packages, including attributed and scoped imports", () => {
		const facts = extractImports(swiftFile("Sources/ItemViewModel.swift"), SWIFT_FIXTURE, new Set());
		const packages = facts.map((fact) => fact.externalPackage).sort();
		expect(packages).toEqual(["Combine", "CoreData", "Foundation", "SampleApp", "UIKit"]);
		expect(facts.every((fact) => !fact.typeOnly)).toBe(true);
	});

	test("extracts declarations with kinds and visibility", () => {
		const symbols = extractSymbols(swiftFile("Sources/ItemViewModel.swift"), SWIFT_FIXTURE);
		const byName = new Map(symbols.map((symbol) => [symbol.name, symbol]));

		expect(byName.get("ItemViewModel")?.kind).toBe("class");
		expect(byName.get("Cache")?.kind).toBe("class");
		expect(byName.get("Refreshable")?.kind).toBe("interface");
		expect(byName.get("State")?.kind).toBe("type");
		expect(byName.get("Completion")?.kind).toBe("type");
		expect(byName.get("refresh")?.kind).toBe("function");
		expect(byName.get("shared")?.kind).toBe("function");

		expect(byName.get("ItemViewModel")?.exported).toBe(true);
		expect(byName.get("Constants")?.exported).toBe(false);
		expect(byName.get("HiddenHelper")?.exported).toBe(false);
		expect(byName.get("retry")?.exported).toBe(false);

		// `class func shared()` must not register a class named "func" or "shared"
		expect(symbols.filter((symbol) => symbol.kind === "class").map((symbol) => symbol.name).sort()).toEqual([
			"Cache",
			"ItemViewModel",
		]);
		// commented-out declaration is skipped
		expect(byName.has("Commented")).toBe(false);
	});

	test("non-swift files are unaffected", () => {
		const facts = extractImports(swiftFile("Sources/README.md"), SWIFT_FIXTURE, new Set());
		expect(facts).toEqual([]);
	});
});
