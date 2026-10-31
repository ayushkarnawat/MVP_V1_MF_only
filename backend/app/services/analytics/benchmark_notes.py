"""Single source of user notes. T3.3 sends rendered text in the payload."""
BENCHMARK_NOTES = {
    "benchmark_note_mix": "This fund's benchmark is a mix: {weights}. We show the returns the fund house prints.",
    "benchmark_note_closest": "We don't have this fund's own benchmark, so it is compared with the {index}, the closest index we hold.",
    "benchmark_note_printed": "Benchmark returns are as printed in the fund house's factsheet for {date}.",
    "benchmark_note_gold": "Compared with the price of gold, shown through a gold fund that tracks it.",
}


def benchmark_note(key: str, **values: str) -> str:
    return BENCHMARK_NOTES[key].format(**values)
