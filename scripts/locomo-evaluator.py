#!/usr/bin/env python3

import json
import math
import string
import sys
from collections import Counter, defaultdict

import numpy as np
import regex
from nltk.stem import PorterStemmer

ps = PorterStemmer()


def normalize_answer(value: str) -> str:
    value = value.replace(',', '')

    def remove_articles(text: str) -> str:
        return regex.sub(r'\b(a|an|the|and)\b', ' ', text)

    def white_space_fix(text: str) -> str:
        return ' '.join(text.split())

    def remove_punc(text: str) -> str:
        exclude = set(string.punctuation)
        return ''.join(ch for ch in text if ch not in exclude)

    return white_space_fix(remove_articles(remove_punc(value.lower())))


def f1_score(prediction: str, ground_truth: str) -> float:
    prediction_tokens = [ps.stem(word) for word in normalize_answer(prediction).split()]
    ground_truth_tokens = [ps.stem(word) for word in normalize_answer(ground_truth).split()]
    common = Counter(prediction_tokens) & Counter(ground_truth_tokens)
    num_same = sum(common.values())
    if num_same == 0:
        return 0.0
    precision = num_same / len(prediction_tokens)
    recall = num_same / len(ground_truth_tokens)
    return (2 * precision * recall) / (precision + recall)


def f1_multi(prediction: str, ground_truth: str) -> float:
    predictions = [part.strip() for part in prediction.split(',')]
    ground_truths = [part.strip() for part in ground_truth.split(',')]
    return float(np.mean([max([f1_score(candidate, truth) for candidate in predictions]) for truth in ground_truths]))


def eval_question_answering(qas, eval_key: str):
    all_scores = []
    all_recall = []

    for idx, qa in enumerate(qas):
        answer = qa['answer'] if isinstance(qa[eval_key], list) else str(qa['answer'])
        if qa['category'] == 3:
            answer = answer.split(';')[0].strip()

        output = qa[eval_key]

        if qa['category'] in [2, 3, 4]:
            all_scores.append(f1_score(output, answer))
        elif qa['category'] == 1:
            all_scores.append(f1_multi(output, answer))
        elif qa['category'] == 5:
            lowered = output.lower()
            all_scores.append(1.0 if 'no information available' in lowered or 'not mentioned' in lowered else 0.0)
        else:
            raise ValueError(f'Unsupported LoCoMo category: {qa["category"]}')

        assert idx + 1 == len(all_scores)

        context_key = eval_key + '_context'
        if context_key in qa and len(qa.get('evidence', [])) > 0:
            if qa[context_key] and qa[context_key][0].startswith('S'):
                sessions = [entry[1:] for entry in qa[context_key]]
                recall_acc = float(sum([evidence.split(':')[0][1:] in sessions for evidence in qa['evidence']])) / len(qa['evidence'])
            else:
                recall_acc = float(sum([evidence in qa[context_key] for evidence in qa['evidence']])) / len(qa['evidence'])
            all_recall.append(recall_acc)
        else:
            all_recall.append(1.0)

    return all_scores, all_recall


def get_conversation_lengths(conversation):
    total_conv_length = 0
    id2length = {}
    for session_num in range(1, 50):
        session_key = f'session_{session_num}'
        if session_key not in conversation or conversation[session_key] == []:
            continue

        for dialog in conversation[session_key]:
            dialog_tokens = dialog['speaker'] + ': ' + dialog['text'] + '\n'
            if 'img_file' in dialog and len(dialog['img_file']) > 0:
                dialog_tokens += '[shares %s]\n' % dialog['blip_caption']
            dialog_length = len(dialog_tokens)
            id2length[dialog['dia_id']] = total_conv_length + dialog_length
            total_conv_length += dialog_length
    return id2length


def analyze_aggr_acc(dataset, outputs, model_name: str, metric_key: str):
    total_counts = defaultdict(lambda: 0)
    acc_counts = defaultdict(lambda: 0.0)
    memory_counts = defaultdict(lambda: defaultdict(lambda: 0.0))
    memory_counts_og = defaultdict(lambda: defaultdict(lambda: 0))
    context_len_counts = defaultdict(lambda: 0.0)
    context_len_og = defaultdict(lambda: 0)

    output_by_sample = {entry['sample_id']: entry for entry in outputs}
    data_by_sample = {entry['sample_id']: entry for entry in dataset}

    for sample_id in output_by_sample.keys():
        output = output_by_sample[sample_id]
        ann = data_by_sample[sample_id]
        id2length = get_conversation_lengths(ann['conversation'])

        for qa in output['qa']:
            total_counts[qa['category']] += 1
            if metric_key not in qa:
                continue

            acc_counts[qa['category']] += qa[metric_key]
            qa['evidence'] = [value.replace('(', '').replace(')', '') for value in qa.get('evidence', [])]
            if len(qa['evidence']) == 0:
                continue

            try:
                farthest_session = min([int(value.split(':')[0][1:]) for value in qa['evidence'] if value != ''])
                farthest_dialog = min(
                    [
                        int(value.split(':')[-1])
                        for value in qa['evidence']
                        if value != '' and int(value.split(':')[0][1:]) == farthest_session
                    ]
                )
                farthest_length = id2length['D' + str(farthest_session) + ':' + str(farthest_dialog)]
                memory_bucket = math.ceil(farthest_length / 1000)
                memory_counts_og[qa['category']][memory_bucket] += 1
                memory_counts[qa['category']][memory_bucket] += qa[metric_key]

                if qa['category'] == 1:
                    latest_session = max([int(value.split(':')[0][1:]) for value in qa['evidence'] if value != ''])
                    latest_dialog = max(
                        [
                            int(value.split(':')[-1])
                            for value in qa['evidence']
                            if value != '' and int(value.split(':')[0][1:]) == latest_session
                        ]
                    )
                    latest_length = id2length['D' + str(latest_session) + ':' + str(latest_dialog)]
                    context_length = latest_length - farthest_length
                    bucket = math.ceil(context_length / 1000)
                    context_len_og[bucket] += 1
                    context_len_counts[bucket] += qa[metric_key]
            except Exception:
                continue

    overall_total = sum(total_counts.values())
    overall_accuracy = 0.0 if overall_total == 0 else sum(acc_counts.values()) / overall_total
    category_accuracy = {
        str(key): (0.0 if total_counts[key] == 0 else round(acc_counts[key] / total_counts[key], 6))
        for key in [4, 1, 2, 3, 5]
    }

    return {
        model_name: {
            'category_counts': {str(key): total_counts[key] for key in [4, 1, 2, 3, 5]},
            'cum_accuracy_by_category': {str(key): round(acc_counts[key], 6) for key in [4, 1, 2, 3, 5]},
            'category_counts_by_memory': {
                str(category): {str(bucket): count for bucket, count in values.items()}
                for category, values in memory_counts_og.items()
            },
            'cum_accuracy_by_category_by_memory': {
                str(category): {str(bucket): round(score, 6) for bucket, score in values.items()}
                for category, values in memory_counts.items()
            },
            'context_length_counts': {str(bucket): count for bucket, count in context_len_og.items()},
            'cum_accuracy_by_context_length': {
                str(bucket): round(score, 6) for bucket, score in context_len_counts.items()
            },
        },
        'overall_accuracy': round(overall_accuracy, 6),
        'category_accuracy': category_accuracy,
    }


def main() -> int:
    if len(sys.argv) != 6:
        print(
            'Usage: locomo-evaluator.py predictions.json dataset.json output.json model_key prediction_key',
            file=sys.stderr,
        )
        return 2

    predictions_path = sys.argv[1]
    dataset_path = sys.argv[2]
    output_path = sys.argv[3]
    model_key = sys.argv[4]
    prediction_key = sys.argv[5]

    predictions = json.load(open(predictions_path, 'r', encoding='utf-8'))
    dataset = json.load(open(dataset_path, 'r', encoding='utf-8'))

    for sample in predictions:
        scores, recall = eval_question_answering(sample['qa'], prediction_key)
        for idx, qa in enumerate(sample['qa']):
            qa[model_key + '_f1'] = round(scores[idx], 3)
            if prediction_key + '_context' in qa:
                qa[model_key + '_recall'] = round(recall[idx], 3)

    stats = analyze_aggr_acc(dataset, predictions, model_key, model_key + '_f1')

    output = {
        'dataset_path': dataset_path,
        'predictions_path': predictions_path,
        'model_key': model_key,
        'prediction_key': prediction_key,
        'question_count': sum(len(sample['qa']) for sample in predictions),
        'overall_accuracy': stats['overall_accuracy'],
        'category_accuracy': stats['category_accuracy'],
        'stats': stats[model_key],
        'scored_samples': predictions,
    }

    with open(output_path, 'w', encoding='utf-8') as handle:
        json.dump(output, handle, indent=2)

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
