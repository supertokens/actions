import os
import sys
from collections import defaultdict

import httpx

ref_type = os.environ["INPUT_REF_TYPE"]
ref = os.environ["INPUT_REF"]
repository = os.environ["INPUT_REPOSITORY"]
run_id = os.environ["INPUT_RUN_ID"]
github_token = os.environ.get("INPUT_GITHUB_TOKEN", "")

if ref_type not in ("branch", "tag", "commit"):
    print(f"Invalid ref type: {ref_type}")
    sys.exit(1)

if ref_type == "branch":
    ref_url_part = f"heads/{ref}"
elif ref_type == "tag":
    ref_url_part = f"tags/{ref}"
else:
    ref_url_part = ref

headers = {}
if github_token:
    headers["Authorization"] = f"token {github_token}"

check_runs_url = f"https://api.github.com/repos/{repository}/commits/{ref_url_part}/check-runs?per_page=100&page={{page}}"
jobs_url = f"https://api.github.com/repos/{repository}/actions/runs/{run_id}/jobs"

current_jobs_response = httpx.get(jobs_url, headers=headers, timeout=30).json()
current_job_ids = [job["id"] for job in current_jobs_response["jobs"]]

page = 1
total = 0

status_map = defaultdict(int)
conclusion_map = defaultdict(int)
failures = []

while True:
    response = httpx.get(
        check_runs_url.format(page=page), headers=headers, timeout=30
    ).json()

    if len(response.get("check_runs", [])) == 0:
        break

    for run_info in response["check_runs"]:
        # Release pipeline jobs also show up in check-runs
        # We skip them from the checks to avoid pipeline failures
        if run_info["id"] in current_job_ids:
            continue

        if run_info["conclusion"] == "failure":
            failures.append(run_info["html_url"])

        status_map[run_info["status"]] += 1
        conclusion_map[run_info["conclusion"]] += 1
        total += 1

    page += 1

print(f"{page=}")
print(f"{total=}")
print("Status Map =", dict(status_map))
print("Conclusion Map =", dict(conclusion_map))
print()

# Possible values (from docs):
# [completed, action_required, cancelled, failure, neutral, skipped, stale, success,
# timed_out, in_progress, queued, requested, waiting, pending]
if status_map["completed"] < total:
    print("Some checks not completed.")
    print(failures)
    sys.exit(1)

# Possible values (from testing):
# None, success, skipped, failure
if conclusion_map.get("failure", 0) > 0:
    print("Some checks not successful.")
    print(failures)
    sys.exit(1)
