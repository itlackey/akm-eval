import argparse
import json
import sys

from swebench.harness.utils import load_swebench_dataset


def main() -> int:
    parser = argparse.ArgumentParser(description="List an official SWE-bench dataset slice as JSON.")
    parser.add_argument("--dataset_name", required=True)
    parser.add_argument("--split", default="test")
    parser.add_argument("--max_tasks", type=int)
    parser.add_argument("--instance_ids", nargs="*")
    args = parser.parse_args()

    dataset = load_swebench_dataset(args.dataset_name, args.split, args.instance_ids or None)
    if args.max_tasks is not None and args.max_tasks >= 0:
        dataset = dataset[: args.max_tasks]

    payload = {
        "dataset_name": args.dataset_name,
        "split": args.split,
        "count": len(dataset),
        "instances": [
            {
                "instance_id": instance["instance_id"],
                "repo": instance["repo"],
                "base_commit": instance["base_commit"],
                "problem_statement": instance["problem_statement"],
                "hints_text": instance.get("hints_text", ""),
            }
            for instance in dataset
        ],
    }
    json.dump(payload, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
