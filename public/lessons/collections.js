// Lessons: arrays/lists and maps.

export default [
  {
    id: "arrays",
    title: "Arrays & Lists",
    intro: `<p>An <b>array</b> (or <b>list</b>) holds values in order, indexed from <code>0</code>. Most
languages offer a <i>growable</i> version: Python lists, C++ <code>std::vector</code>, Go slices,
Rust <code>Vec</code>, JavaScript arrays.</p>
<p>C arrays have a fixed size, so you reserve room up front and track the length yourself.
Haskell lists are immutable linked lists: "changing" one builds a new list.</p>`,
    output: `len: 5
first: 10
last: 50
after set: 10 20 99 40 50
appended: 10 20 99 40 50 60
slice: 20 99
sum: 279
`,
    code: {
      python: `# A list holds values in order; indexes start at 0.
nums = [10, 20, 30, 40, 50]
print("len:", len(nums))
print("first:", nums[0])
# Negative indexes count from the end.
print("last:", nums[-1])

nums[2] = 99
# *nums spreads the list into separate print arguments.
print("after set:", *nums)

nums.append(60)
print("appended:", *nums)

# nums[start:end] copies a range; end is excluded.
print("slice:", *nums[1:3])

print("sum:", sum(nums))
`,
      c: `#include <stdio.h>

static void show(const char *label, const int *a, int n) {
    printf("%s", label);
    for (int i = 0; i < n; i++) printf(" %d", a[i]);
    printf("\\n");
}

int main(void) {
    /* A fixed-size array with room for one more element. */
    int nums[6] = {10, 20, 30, 40, 50};
    int len = 5;
    printf("len: %d\\n", len);
    printf("first: %d\\n", nums[0]);
    printf("last: %d\\n", nums[len - 1]);

    nums[2] = 99;
    show("after set:", nums, len);

    /* Arrays can't grow: we reserved the space and track the length. */
    nums[len++] = 60;
    show("appended:", nums, len);

    /* A "slice" is a pointer into the array plus a length. */
    show("slice:", nums + 1, 2);

    int sum = 0;
    for (int i = 0; i < len; i++) sum += nums[i];
    printf("sum: %d\\n", sum);
    return 0;
}
`,
      cpp: `#include <iostream>
#include <numeric>
#include <string>
#include <vector>

void show(const std::string &label, const std::vector<int> &v) {
    std::cout << label;
    for (int x : v) std::cout << " " << x;
    std::cout << "\\n";
}

int main() {
    // std::vector is a growable array.
    std::vector<int> nums = {10, 20, 30, 40, 50};
    std::cout << "len: " << nums.size() << "\\n";
    std::cout << "first: " << nums.front() << "\\n";
    std::cout << "last: " << nums.back() << "\\n";

    nums[2] = 99;
    show("after set:", nums);

    nums.push_back(60);
    show("appended:", nums);

    // Copy a range [begin, end) with the iterator constructor.
    std::vector<int> part(nums.begin() + 1, nums.begin() + 3);
    show("slice:", part);

    std::cout << "sum: " << std::accumulate(nums.begin(), nums.end(), 0) << "\\n";
}
`,
      go: `package main

import "fmt"

// fmt prints slices as [10 20 30]; this prints them like the other languages.
func show(label string, s []int) {
	fmt.Print(label)
	for _, x := range s {
		fmt.Print(" ", x)
	}
	fmt.Println()
}

func main() {
	// A slice is a growable view over an array.
	nums := []int{10, 20, 30, 40, 50}
	fmt.Println("len:", len(nums))
	fmt.Println("first:", nums[0])
	fmt.Println("last:", nums[len(nums)-1])

	nums[2] = 99
	show("after set:", nums)

	// append returns the (possibly reallocated) slice: keep the result.
	nums = append(nums, 60)
	show("appended:", nums)

	// nums[1:3] shares memory with nums; it doesn't copy.
	show("slice:", nums[1:3])

	sum := 0
	for _, x := range nums {
		sum += x
	}
	fmt.Println("sum:", sum)
}
`,
      rust: `fn show(label: &str, s: &[i32]) {
    let parts: Vec<String> = s.iter().map(|x| x.to_string()).collect();
    println!("{} {}", label, parts.join(" "));
}

fn main() {
    // Vec is a growable array; vec! builds one.
    let mut nums = vec![10, 20, 30, 40, 50];
    println!("len: {}", nums.len());
    println!("first: {}", nums[0]);
    // last() returns an Option because the Vec might be empty.
    println!("last: {}", nums.last().unwrap());

    nums[2] = 99;
    show("after set:", &nums);

    nums.push(60);
    show("appended:", &nums);

    // &nums[1..3] borrows part of the Vec without copying.
    show("slice:", &nums[1..3]);

    let sum: i32 = nums.iter().sum();
    println!("sum: {}", sum);
}
`,
      haskell: `-- Render a list like "label 1 2 3".
render :: String -> [Int] -> String
render label xs = label ++ concatMap (\\x -> ' ' : show x) xs

main :: IO ()
main = do
  let nums = [10, 20, 30, 40, 50] :: [Int]
  putStrLn ("len: " ++ show (length nums))
  -- !! indexes a list; it walks from the front, so it's O(n).
  putStrLn ("first: " ++ show (nums !! 0))
  putStrLn ("last: " ++ show (last nums))

  -- Lists are immutable: build a new one with element 2 replaced.
  let (before, rest) = splitAt 2 nums
      nums2 = before ++ [99] ++ drop 1 rest
  putStrLn (render "after set:" nums2)

  let nums3 = nums2 ++ [60]
  putStrLn (render "appended:" nums3)

  putStrLn (render "slice:" (take 2 (drop 1 nums3)))
  putStrLn ("sum: " ++ show (sum nums3))
`,
      javascript: `const nums = [10, 20, 30, 40, 50];
console.log("len:", nums.length);
console.log("first:", nums[0]);
console.log("last:", nums[nums.length - 1]);

// const stops reassigning nums, not changing what's inside it.
nums[2] = 99;
console.log("after set:", nums.join(" "));

nums.push(60);
console.log("appended:", nums.join(" "));

// slice(start, end) copies a range; end is excluded.
console.log("slice:", nums.slice(1, 3).join(" "));

// reduce folds the array into one value.
console.log("sum:", nums.reduce((total, x) => total + x, 0));
`,
      typescript: `// number[] is an array of numbers (also written Array<number>).
const nums: number[] = [10, 20, 30, 40, 50];
console.log("len:", nums.length);
console.log("first:", nums[0]);
console.log("last:", nums[nums.length - 1]);

nums[2] = 99;
console.log("after set:", nums.join(" "));

nums.push(60);
// nums.push("sixty"); // error: string is not assignable to number
console.log("appended:", nums.join(" "));

console.log("slice:", nums.slice(1, 3).join(" "));
console.log("sum:", nums.reduce((total, x) => total + x, 0));
`,
    },
  },

  {
    id: "maps",
    title: "Maps",
    intro: `<p>A <b>map</b> (dictionary, hash table) associates keys with values, so you can look a value up by
its key instead of its position.</p>
<p>Iteration order differs between languages; hash maps often have <i>no</i> defined order, so sort the
keys when order matters. C has no built-in map: the example builds a tiny one.</p>`,
    output: `apple: 3
size: 3
size after delete: 2
has banana: false
missing: 0
apple 3
cherry 7
`,
    code: {
      python: `# A dict maps keys to values.
stock = {}
stock["apple"] = 3
stock["banana"] = 5
stock["cherry"] = 7
print("apple:", stock["apple"])
print("size:", len(stock))

del stock["banana"]
print("size after delete:", len(stock))
print("has banana:", str("banana" in stock).lower())

# stock["durian"] would raise KeyError; get takes a default.
print("missing:", stock.get("durian", 0))

# Dicts keep insertion order; sort to make the order explicit.
for fruit in sorted(stock):
    print(fruit, stock[fruit])
`,
      c: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* C has no built-in map. An array of pairs with a linear search is fine for
   a few entries; bigger programs use a hash table. */
struct entry {
    const char *key;
    int value;
};

struct map {
    struct entry items[16];
    int len;
};

static struct entry *find(struct map *m, const char *key) {
    for (int i = 0; i < m->len; i++)
        if (strcmp(m->items[i].key, key) == 0) return &m->items[i];
    return NULL;
}

static void set(struct map *m, const char *key, int value) {
    struct entry *e = find(m, key);
    if (e) e->value = value;
    else m->items[m->len++] = (struct entry){key, value};
}

static int get(struct map *m, const char *key, int fallback) {
    struct entry *e = find(m, key);
    return e ? e->value : fallback;
}

static void del(struct map *m, const char *key) {
    struct entry *e = find(m, key);
    if (e) *e = m->items[--m->len]; /* move the last entry into the hole */
}

static int by_key(const void *a, const void *b) {
    return strcmp(((const struct entry *)a)->key, ((const struct entry *)b)->key);
}

int main(void) {
    struct map stock = {.len = 0};
    set(&stock, "apple", 3);
    set(&stock, "banana", 5);
    set(&stock, "cherry", 7);
    printf("apple: %d\\n", get(&stock, "apple", 0));
    printf("size: %d\\n", stock.len);

    del(&stock, "banana");
    printf("size after delete: %d\\n", stock.len);
    printf("has banana: %s\\n", find(&stock, "banana") ? "true" : "false");
    printf("missing: %d\\n", get(&stock, "durian", 0));

    qsort(stock.items, stock.len, sizeof stock.items[0], by_key);
    for (int i = 0; i < stock.len; i++)
        printf("%s %d\\n", stock.items[i].key, stock.items[i].value);
    return 0;
}
`,
      cpp: `#include <iostream>
#include <map>
#include <string>

int main() {
    // std::map keeps keys sorted; std::unordered_map is a hash table.
    std::map<std::string, int> stock;
    stock["apple"] = 3;
    stock["banana"] = 5;
    stock["cherry"] = 7;
    std::cout << "apple: " << stock["apple"] << "\\n";
    std::cout << "size: " << stock.size() << "\\n";

    stock.erase("banana");
    std::cout << "size after delete: " << stock.size() << "\\n";
    std::cout << std::boolalpha << "has banana: " << (stock.count("banana") > 0) << "\\n";

    // Careful: stock["durian"] would INSERT a 0 entry. find() doesn't.
    auto it = stock.find("durian");
    std::cout << "missing: " << (it == stock.end() ? 0 : it->second) << "\\n";

    // Structured bindings unpack each key/value pair.
    for (const auto &[fruit, count] : stock) {
        std::cout << fruit << " " << count << "\\n";
    }
}
`,
      go: `package main

import (
	"fmt"
	"sort"
)

func main() {
	// make creates an empty map from string to int.
	stock := make(map[string]int)
	stock["apple"] = 3
	stock["banana"] = 5
	stock["cherry"] = 7
	fmt.Println("apple:", stock["apple"])
	fmt.Println("size:", len(stock))

	delete(stock, "banana")
	fmt.Println("size after delete:", len(stock))

	// The optional second value reports whether the key was present.
	_, ok := stock["banana"]
	fmt.Println("has banana:", ok)

	// A missing key gives the zero value.
	fmt.Println("missing:", stock["durian"])

	// Map iteration order is random: sort the keys for stable output.
	keys := make([]string, 0, len(stock))
	for k := range stock {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		fmt.Println(k, stock[k])
	}
}
`,
      rust: `use std::collections::HashMap;

fn main() {
    let mut stock = HashMap::new();
    stock.insert("apple", 3);
    stock.insert("banana", 5);
    stock.insert("cherry", 7);
    println!("apple: {}", stock["apple"]);
    println!("size: {}", stock.len());

    stock.remove("banana");
    println!("size after delete: {}", stock.len());
    println!("has banana: {}", stock.contains_key("banana"));

    // get returns an Option: Some(&value), or None for a missing key.
    println!("missing: {}", stock.get("durian").copied().unwrap_or(0));

    // HashMap order is unspecified: sort the keys (or use a BTreeMap).
    let mut keys: Vec<_> = stock.keys().collect();
    keys.sort();
    for k in keys {
        println!("{} {}", k, stock[k]);
    }
}
`,
      haskell: `import Data.Char (toLower)
import qualified Data.Map as Map

main :: IO ()
main = do
  -- Data.Map is an immutable sorted map: each "change" returns a new map.
  let stock = Map.fromList [("apple", 3), ("banana", 5), ("cherry", 7)] :: Map.Map String Int
  putStrLn ("apple: " ++ show (stock Map.! "apple"))
  putStrLn ("size: " ++ show (Map.size stock))

  let stock' = Map.delete "banana" stock
  putStrLn ("size after delete: " ++ show (Map.size stock'))
  putStrLn ("has banana: " ++ map toLower (show (Map.member "banana" stock')))
  putStrLn ("missing: " ++ show (Map.findWithDefault 0 "durian" stock'))

  -- toList returns the pairs in key order.
  mapM_ (\\(fruit, n) -> putStrLn (fruit ++ " " ++ show n)) (Map.toList stock')
`,
      javascript: `// Map keeps insertion order and allows any key type.
const stock = new Map();
stock.set("apple", 3);
stock.set("banana", 5);
stock.set("cherry", 7);
console.log("apple:", stock.get("apple"));
console.log("size:", stock.size);

stock.delete("banana");
console.log("size after delete:", stock.size);
console.log("has banana:", stock.has("banana"));

// get returns undefined for a missing key; ?? supplies a default.
console.log("missing:", stock.get("durian") ?? 0);

for (const fruit of [...stock.keys()].sort()) {
  console.log(fruit, stock.get(fruit));
}
`,
      typescript: `// Map<K, V> types both the keys and the values.
const stock = new Map<string, number>();
stock.set("apple", 3);
stock.set("banana", 5);
stock.set("cherry", 7);
console.log("apple:", stock.get("apple"));
console.log("size:", stock.size);

stock.delete("banana");
console.log("size after delete:", stock.size);
console.log("has banana:", stock.has("banana"));

// get returns number | undefined, so tsc makes you handle the missing case.
const durian: number = stock.get("durian") ?? 0;
console.log("missing:", durian);

for (const fruit of [...stock.keys()].sort()) {
  console.log(fruit, stock.get(fruit));
}
`,
    },
  },
];
