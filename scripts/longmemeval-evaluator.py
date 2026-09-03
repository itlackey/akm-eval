#!/usr/bin/env python3

import json
import os
import sys


def load_entries(path: str):
    with open(path, 'r', encoding='utf-8') as handle:
        if path.endswith('.jsonl'):
            return [json.loads(line) for line in handle if line.strip()]
        return json.load(handle)


def sanitize_file_component(value: str) -> str:
    return ''.join(ch if ch.isalnum() or ch in {'-', '_', '.'} else '_' for ch in value)


def get_prompt(question_type: str, question: str, answer: str, response: str, abstention: bool) -> str:
    if abstention:
        return (
            'I will give you an unanswerable question, an explanation, and a response from a model. '
            'Please answer yes if the model correctly identifies the question as unanswerable. '
            'The model could say that the information is incomplete, or some other information is given but the asked information is not.\n\n'
            f'Question: {question}\n\nExplanation: {answer}\n\nModel Response: {response}\n\n'
            'Does the model correctly identify the question as unanswerable? Answer yes or no only.'
        )

    if question_type in {'single-session-user', 'single-session-assistant', 'multi-session'}:
        rubric = (
            'Please answer yes if the response contains the correct answer. Otherwise, answer no. '
            'If the response is equivalent to the correct answer or contains all the intermediate steps to get the correct answer, '
            'you should also answer yes. If the response only contains a subset of the information required by the answer, answer no.'
        )
    elif question_type == 'temporal-reasoning':
        rubric = (
            'Please answer yes if the response contains the correct answer. Otherwise, answer no. '
            'If the response is equivalent to the correct answer or contains all the intermediate steps to get the correct answer, '
            'you should also answer yes. If the response only contains a subset of the information required by the answer, answer no. '
            'Do not penalize off-by-one errors for the number of days, weeks, or months.'
        )
    elif question_type == 'knowledge-update':
        rubric = (
            'Please answer yes if the response contains the correct updated answer. Otherwise, answer no. '
            'If the response contains previous information along with the updated answer, it is still correct.'
        )
    elif question_type == 'single-session-preference':
        rubric = (
            'Please answer yes if the response satisfies the desired personalized response. Otherwise, answer no. '
            'The response does not need to reflect all rubric points. It is correct as long as it recalls and uses personal information correctly.'
        )
    else:
        raise SystemExit(f'Unsupported LongMemEval question type: {question_type}')

    return (
        'I will give you a question, a correct answer, and a response from a model. '
        f'{rubric}\n\nQuestion: {question}\n\nCorrect Answer: {answer}\n\nModel Response: {response}\n\n'
        'Is the model response correct? Answer yes or no only.'
    )


def main() -> int:
    if len(sys.argv) != 4:
        print('Usage: longmemeval-evaluator.py metric_model predictions.jsonl dataset.json', file=sys.stderr)
        return 2

    metric_model = sys.argv[1]
    predictions_path = sys.argv[2]
    dataset_path = sys.argv[3]

    # The judge may need a different endpoint than the agent under test: the
    # benchmark specifies its judge model, and the endpoint an agent runs on
    # does not necessarily serve it. AKM_EVAL_JUDGE_* wins when set; OPENAI_*
    # remains the fallback for the common case where both are the same.
    api_key = os.environ.get('AKM_EVAL_JUDGE_API_KEY') or os.environ.get('OPENAI_API_KEY')
    base_url = os.environ.get('AKM_EVAL_JUDGE_BASE_URL')
    if base_url is None and not os.environ.get('AKM_EVAL_JUDGE_API_KEY'):
        base_url = os.environ.get('OPENAI_BASE_URL')
    if not api_key and not base_url:
        print('Set OPENAI_API_KEY for cloud OpenAI or OPENAI_BASE_URL for an OpenAI-compatible evaluator endpoint.', file=sys.stderr)
        return 2
    if not api_key:
        api_key = 'dummy'

    try:
        from openai import OpenAI
    except ImportError:
        print('The openai package is required. Install it in the Python environment used for LongMemEval evaluation.', file=sys.stderr)
        return 2

    predictions = load_entries(predictions_path)
    dataset = load_entries(dataset_path)
    dataset_by_id = {entry['question_id']: entry for entry in dataset}

    client_kwargs = {'api_key': api_key}
    if base_url:
        client_kwargs['base_url'] = base_url
    client = OpenAI(**client_kwargs)
    output_path = f'{predictions_path}.eval-results-{sanitize_file_component(metric_model)}'

    with open(output_path, 'w', encoding='utf-8') as handle:
        for prediction in predictions:
            question_id = prediction['question_id']
            reference = dataset_by_id[question_id]
            prompt = get_prompt(
                reference['question_type'],
                reference['question'],
                reference['answer'],
                prediction['hypothesis'],
                question_id.endswith('_abs'),
            )
            completion = client.chat.completions.create(
                model=metric_model,
                messages=[{'role': 'user', 'content': prompt}],
                temperature=0,
                max_tokens=10,
            )
            verdict = completion.choices[0].message.content.strip().lower()
            prediction['autoeval_label'] = {
                'model': metric_model,
                'label': 'yes' in verdict,
            }
            handle.write(json.dumps(prediction) + '\n')

    print(output_path)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
