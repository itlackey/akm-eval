import argparse
import glob
import os
from tau_bench.run import run
from tau_bench.types import RunConfig


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", required=True, choices=["retail", "airline"])
    parser.add_argument("--model", required=True)
    parser.add_argument("--model-provider", required=True)
    parser.add_argument("--user-model")
    parser.add_argument("--user-model-provider")
    parser.add_argument("--agent-strategy", default="tool-calling")
    parser.add_argument("--user-strategy", default="llm")
    parser.add_argument("--task-split", default="test")
    parser.add_argument("--num-trials", type=int, default=1)
    parser.add_argument("--max-concurrency", type=int, default=1)
    parser.add_argument("--temperature", type=float, default=0.0)
    parser.add_argument("--seed", type=int, default=10)
    parser.add_argument("--shuffle", type=int, default=0)
    parser.add_argument("--start-index", type=int, default=0)
    parser.add_argument("--end-index", type=int, default=-1)
    parser.add_argument("--log-dir", required=True)
    parser.add_argument("--task-id", action="append", type=int, dest="task_ids")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    os.makedirs(args.log_dir, exist_ok=True)

    config = RunConfig(
        model_provider=args.model_provider,
        user_model_provider=args.user_model_provider or args.model_provider,
        model=args.model,
        user_model=args.user_model or args.model,
        num_trials=args.num_trials,
        env=args.env,
        agent_strategy=args.agent_strategy,
        temperature=args.temperature,
        task_split=args.task_split,
        start_index=args.start_index,
        end_index=args.end_index,
        task_ids=args.task_ids,
        log_dir=args.log_dir,
        max_concurrency=args.max_concurrency,
        seed=args.seed,
        shuffle=args.shuffle,
        user_strategy=args.user_strategy,
    )

    run(config)

    result_files = sorted(glob.glob(os.path.join(args.log_dir, "*.json")), key=os.path.getmtime)
    if not result_files:
        raise RuntimeError(f"tau-bench did not write any JSON results into {args.log_dir}")
    print(f"AKM_EVAL_TAU_BENCH_RESULTS={result_files[-1]}")


if __name__ == "__main__":
    main()
