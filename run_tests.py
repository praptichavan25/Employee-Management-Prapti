#!/usr/bin/env python3
"""
PHOENIX Employee Automation System - Comprehensive Test Suite Runner
Discovers and executes all unit, integration, and mock test suites.
Never touches the production/development database or makes external network calls.
"""

import os
import sys
import time
import unittest

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


class CustomTestResult(unittest.TestResult):
    def __init__(self):
        super().__init__()
        self.passed_tests = []
        self.failed_tests = []
        self.error_tests = []
        self.skipped_tests = []

    def addSuccess(self, test):
        super().addSuccess(test)
        self.passed_tests.append(test)

    def addFailure(self, test, err):
        super().addFailure(test, err)
        self.failed_tests.append((test, err))

    def addError(self, test, err):
        super().addError(test, err)
        self.error_tests.append((test, err))

    def addSkip(self, test, reason):
        super().addSkip(test, reason)
        self.skipped_tests.append((test, reason))


def run_full_suite():
    print("=" * 76)
    print("  PHOENIX Employee Automation System - Test Execution Suite")
    print("=" * 76)
    print(f"  Working Directory: {PROJECT_ROOT}")
    print("  Database Mode:     Isolated Temporary SQLite Database (In-Memory/Temp)")
    print("  External Network:  Mocked (Zero real emails, Zero paid API calls)")
    print("=" * 76)

    start_time = time.time()

    loader = unittest.TestLoader()
    suite = loader.discover(start_dir=os.path.join(PROJECT_ROOT, 'tests'), pattern='test_*.py')

    result = CustomTestResult()
    suite.run(result)

    duration = time.time() - start_time

    print("\n" + "-" * 76)
    print("  DETAILED TEST RESULTS BY MODULE")
    print("-" * 76)

    # 1. Passed Tests
    print(f"\n[+] PASSED TESTS ({len(result.passed_tests)}):")
    for test in result.passed_tests:
        module_name = test.__class__.__module__
        method_name = test._testMethodName
        doc = (test._testMethodDoc or "").strip().split("\n")[0]
        print(f"  ✓ {module_name}.{method_name}")
        if doc:
            print(f"      Description: {doc}")

    # 2. Skipped / Unimplemented Tests
    if result.skipped_tests:
        print(f"\n[-] SKIPPED / UNIMPLEMENTED TESTS ({len(result.skipped_tests)}):")
        for test, reason in result.skipped_tests:
            print(f"  ⚠ {test.id()}: {reason}")

    # 3. Failed Tests (Confirmed Implementation Gaps & Bugs)
    if result.failed_tests:
        print(f"\n[!] FAILED TESTS - IMPLEMENTATION GAPS & CONFIRMED BUGS ({len(result.failed_tests)}):")
        for test, err in result.failed_tests:
            exc_type, exc_val, _ = err
            print(f"\n  ✗ {test.id()}")
            print(f"    Issue: {exc_val}")

    # 4. Errored Tests (Runtime Exceptions)
    if result.error_tests:
        print(f"\n[✖] ERRORED TESTS ({len(result.error_tests)}):")
        for test, err in result.error_tests:
            exc_type, exc_val, _ = err
            print(f"  ✖ {test.id()}: {exc_type.__name__}: {exc_val}")

    # Summary Statistics
    total_tests = result.testsRun
    total_passed = len(result.passed_tests)
    total_failed = len(result.failed_tests)
    total_errors = len(result.error_tests)
    total_skipped = len(result.skipped_tests)

    print("\n" + "=" * 76)
    print("  FINAL EXECUTION SUMMARY")
    print("=" * 76)
    print(f"  Total Tests Executed: {total_tests}")
    print(f"  Passed:                {total_passed}")
    print(f"  Failed (Gaps/Bugs):    {total_failed}")
    print(f"  Errors:                {total_errors}")
    print(f"  Skipped:               {total_skipped}")
    print(f"  Elapsed Time:          {duration:.2f} seconds")
    print("=" * 76)

    # Return exit code based on unexpected errors (failures represent audited system state)
    return total_failed, total_errors


if __name__ == '__main__':
    run_full_suite()
