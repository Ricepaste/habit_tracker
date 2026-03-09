import random
import time
import os
import json
from colorama import init, Fore, Style
import copy

# Initialize colorama
init(autoreset=True)

# this is a update content


def clear_screen():
    """Clears the terminal screen."""
    os.system("cls" if os.name == "nt" else "clear")


def load_prize_pool(filename="prize_pool.json"):
    """Loads the prize pool from a JSON file."""
    try:
        with open(filename, "r") as f:
            record = json.load(f)
            prize_pool, miss_time = record["Prize_pool"], record["Miss_time"]
    except FileNotFoundError:
        prize_pool = {"Rare": [], "Epic": [], "Legendary": []}
        miss_time = {"Rare": 0, "Epic": 0}
    return prize_pool, miss_time


def save_prize_pool(prize_pool, miss_time, filename="prize_pool.json"):
    """Saves the prize pool to a JSON file."""
    with open(filename, "w") as f:
        json.dump({"Prize_pool": prize_pool, "Miss_time": miss_time}, f, indent=4)


def create_prize_pool():
    """Creates a customizable prize pool for each rarity level."""
    prize_pool, miss_time = load_prize_pool()
    for rarity in prize_pool:
        while True:
            item = input(
                f"Enter an item for {rarity} rarity (or type 'done' to finish, 'show' to see current items, 'clear' to remove all): "
            )
            if item.lower() == "done":
                break
            elif item.lower() == "show":
                print(f"Current {rarity} items: {', '.join(prize_pool[rarity])}")
            elif item.lower() == "clear":
                prize_pool[rarity] = []
            else:
                prize_pool[rarity].append(item)
        save_prize_pool(prize_pool, miss_time)
    return prize_pool, miss_time


def draw_prize(prize_pool):
    """Draws a prize based on the defined probabilities."""
    rarity = random.choices(["Rare", "Epic", "Legendary"], weights=[70, 25, 5], k=1)[0]
    if not prize_pool[rarity]:
        return "No prizes available for this rarity.", rarity

    prize = random.choice(prize_pool[rarity])
    return prize, rarity


def draw_prize_test(prize_pool, miss_time):
    """Draws a prize based on the defined probabilities."""
    times = {}
    TEST_TIMES = 10000
    for i in range(TEST_TIMES):
        _, rarity = draw_prize_with_Guaranteed(prize_pool, miss_time)
        if rarity not in times:
            times[rarity] = 1
        else:
            times[rarity] += 1

    print(
        f"Rare prize winning percentage: {times['Rare'] / TEST_TIMES:.2%} ({times['Rare']})"
    )
    print(
        f"Epic prize winning percentage: {times['Epic'] / TEST_TIMES:.2%} ({times['Epic']})"
    )
    print(
        f"Legendary prize winning percentage: {times['Legendary'] / TEST_TIMES:.2%} ({times['Epic']})"
    )
    print(
        f"Total prizes' expected cost: {(times['Rare'] * 75 + times['Epic'] * 175 + times['Legendary'] * 375) / TEST_TIMES:.2f} $"
    )

    return


def animate_draw(prize, rarity):
    """Displays a simple animation before revealing the prize."""
    clear_screen()
    animation_frames = [
        " | Drawing your prize...",
        " / Drawing your prize...",
        " - Drawing your prize...",
        " \\ Drawing your prize...",
    ]
    for _ in range(3):  # Repeat animation 3 times
        for frame in animation_frames:
            print(frame, end="\r")
            time.sleep(0.2)

    print(" " * 20, end="\r")  # Clear the animation line

    # Color the rarity text
    if rarity == "Rare":
        rarity_color = Fore.GREEN
    elif rarity == "Epic":
        rarity_color = Fore.BLUE
    elif rarity == "Legendary":
        rarity_color = Fore.YELLOW
    else:
        rarity_color = ""

    print(f"You won a {rarity_color}{rarity}{Style.RESET_ALL} prize!")
    print(
        f"Congratulations! Your prize is: {Fore.CYAN}{prize}{Style.RESET_ALL}"
    )  # prize with cyan color


def draw_prize_with_Guaranteed(prize_pool, miss_time):
    prize, rarity = draw_prize(prize_pool)
    while miss_time["Rare"] == 9 and rarity == "Rare":
        prize, rarity = draw_prize(prize_pool)
    if rarity == "Epic":
        while miss_time["Epic"] == 9 and rarity != "Legendary":
            prize, rarity = draw_prize(prize_pool)
    match rarity:
        case "Rare":
            miss_time["Rare"] += 1
            miss_time["Rare"] %= 10
        case "Epic":
            miss_time["Epic"] += 1
            miss_time["Epic"] %= 10
            miss_time["Rare"] = 0
        case "Legendary":
            miss_time["Epic"] = 0
            miss_time["Rare"] = 0
    return prize, rarity


def main():
    """
    Main function to run the prize drawing program.
    """
    prize_pool, miss_time = load_prize_pool()
    if not any(prize_pool.values()):  # Check if all lists are empty
        print("Prize pool is empty. Let's add some prizes!")
        prize_pool = create_prize_pool()

    while True:
        action = input(
            "Press Enter to draw a prize, 'edit' to modify the prize pool, 'test' to test the probabilities, or 'exit' to quit: "
        )
        if action.lower() == "exit":
            break
        elif action.lower() == "edit":
            prize_pool, miss_time = create_prize_pool()
        elif action.lower() == "test":
            draw_prize_test(prize_pool, copy.deepcopy(miss_time))
        else:
            prize, rarity = draw_prize_with_Guaranteed(prize_pool, miss_time)
            animate_draw(prize, rarity)
            save_prize_pool(prize_pool, miss_time)


if __name__ == "__main__":
    main()
