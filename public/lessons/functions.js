// Lessons: functions, multiple return values, closures, recursion.

export default [
  {
    id: "functions",
    title: "Functions",
    intro: `<p>A <b>function</b> packages code under a name, takes <b>parameters</b> and <b>returns</b> a
result. Functions are the main way to split a program into reusable pieces.</p>
<p>The example also shows functions taking <i>any number</i> of arguments, and functions passed to
other functions as values.</p>`,
    output: `1+2 = 3
1+2+3 = 6
sum of 1 2 3 4: 10
apply(double, 5) = 10
`,
    code: {
      python: `def plus(a, b):
    return a + b


# A default value makes c optional.
def plus_plus(a, b, c=0):
    return a + b + c


# *nums collects any number of arguments into a tuple.
def total(*nums):
    return sum(nums)


# Functions are values, so they can be passed around.
def apply(f, x):
    return f(x)


def double(x):
    return x * 2


print("1+2 =", plus(1, 2))
print("1+2+3 =", plus_plus(1, 2, 3))
print("sum of 1 2 3 4:", total(1, 2, 3, 4))
print("apply(double, 5) =", apply(double, 5))
`,
      c: `#include <stdarg.h>
#include <stdio.h>

/* The return type comes first, then each parameter's type and name. */
static int plus(int a, int b) { return a + b; }

static int plus_plus(int a, int b, int c) { return a + b + c; }

/* Variadic: C can't tell how many arguments came, so pass the count first. */
static int total(int count, ...) {
    va_list args;
    va_start(args, count);
    int sum = 0;
    for (int i = 0; i < count; i++) sum += va_arg(args, int);
    va_end(args);
    return sum;
}

/* f is a function pointer: a function taking an int and returning an int. */
static int apply(int (*f)(int), int x) { return f(x); }

static int double_it(int x) { return x * 2; } /* double is a C keyword */

int main(void) {
    printf("1+2 = %d\\n", plus(1, 2));
    printf("1+2+3 = %d\\n", plus_plus(1, 2, 3));
    printf("sum of 1 2 3 4: %d\\n", total(4, 1, 2, 3, 4));
    printf("apply(double, 5) = %d\\n", apply(double_it, 5));
    return 0;
}
`,
      cpp: `#include <functional>
#include <initializer_list>
#include <iostream>

int plus(int a, int b) { return a + b; }

// A default argument makes c optional.
int plusPlus(int a, int b, int c = 0) { return a + b + c; }

// Any number of ints, passed as {1, 2, 3}.
int total(std::initializer_list<int> nums) {
    int sum = 0;
    for (int n : nums) sum += n;
    return sum;
}

// std::function holds any callable: a function, a lambda, ...
int apply(const std::function<int(int)> &f, int x) { return f(x); }

int main() {
    std::cout << "1+2 = " << plus(1, 2) << "\\n";
    std::cout << "1+2+3 = " << plusPlus(1, 2, 3) << "\\n";
    std::cout << "sum of 1 2 3 4: " << total({1, 2, 3, 4}) << "\\n";

    // A lambda: [captures](parameters) { body }
    auto doubleIt = [](int x) { return x * 2; };
    std::cout << "apply(double, 5) = " << apply(doubleIt, 5) << "\\n";
}
`,
      go: `package main

import "fmt"

// Parameter types follow the names; the result type comes last.
func plus(a int, b int) int {
	return a + b
}

// Consecutive parameters of the same type can share it.
func plusPlus(a, b, c int) int {
	return a + b + c
}

// ...int accepts any number of ints, as a slice.
func total(nums ...int) int {
	sum := 0
	for _, n := range nums {
		sum += n
	}
	return sum
}

// f's type is "function from int to int".
func apply(f func(int) int, x int) int {
	return f(x)
}

func double(x int) int {
	return x * 2
}

func main() {
	fmt.Println("1+2 =", plus(1, 2))
	fmt.Println("1+2+3 =", plusPlus(1, 2, 3))
	fmt.Println("sum of 1 2 3 4:", total(1, 2, 3, 4))
	fmt.Println("apply(double, 5) =", apply(double, 5))
}
`,
      rust: `fn plus(a: i32, b: i32) -> i32 {
    // The last expression, without a semicolon, is the return value.
    a + b
}

fn plus_plus(a: i32, b: i32, c: i32) -> i32 {
    a + b + c
}

// Rust has no variadic functions: take a slice instead.
fn total(nums: &[i32]) -> i32 {
    nums.iter().sum()
}

// Generic over any function or closure from i32 to i32.
fn apply<F: Fn(i32) -> i32>(f: F, x: i32) -> i32 {
    f(x)
}

fn double(x: i32) -> i32 {
    x * 2
}

fn main() {
    println!("1+2 = {}", plus(1, 2));
    println!("1+2+3 = {}", plus_plus(1, 2, 3));
    println!("sum of 1 2 3 4: {}", total(&[1, 2, 3, 4]));
    println!("apply(double, 5) = {}", apply(double, 5));
}
`,
      haskell: `-- The signature comes first: plus takes two Ints and returns an Int.
plus :: Int -> Int -> Int
plus a b = a + b

plusPlus :: Int -> Int -> Int -> Int
plusPlus a b c = a + b + c

-- For "any number of arguments", take a list.
total :: [Int] -> Int
total = foldr (+) 0

-- apply takes a function (Int -> Int) as its first argument.
apply :: (Int -> Int) -> Int -> Int
apply f x = f x

double :: Int -> Int
double x = x * 2

main :: IO ()
main = do
  -- Calling a function needs no parentheses or commas.
  putStrLn ("1+2 = " ++ show (plus 1 2))
  putStrLn ("1+2+3 = " ++ show (plusPlus 1 2 3))
  putStrLn ("sum of 1 2 3 4: " ++ show (total [1, 2, 3, 4]))
  putStrLn ("apply(double, 5) = " ++ show (apply double 5))
`,
      javascript: `function plus(a, b) {
  return a + b;
}

// A default value makes c optional.
function plusPlus(a, b, c = 0) {
  return a + b + c;
}

// ...nums collects any number of arguments into an array.
function total(...nums) {
  return nums.reduce((sum, n) => sum + n, 0);
}

function apply(f, x) {
  return f(x);
}

// An arrow function: a compact way to write small functions.
const double = (x) => x * 2;

console.log("1+2 =", plus(1, 2));
console.log("1+2+3 =", plusPlus(1, 2, 3));
console.log("sum of 1 2 3 4:", total(1, 2, 3, 4));
console.log("apply(double, 5) =", apply(double, 5));
`,
      typescript: `function plus(a: number, b: number): number {
  return a + b;
}

// c? marks an optional parameter; = 0 gives it a default instead.
function plusPlus(a: number, b: number, c: number = 0): number {
  return a + b + c;
}

function total(...nums: number[]): number {
  return nums.reduce((sum, n) => sum + n, 0);
}

// f's type is written like an arrow function.
function apply(f: (x: number) => number, x: number): number {
  return f(x);
}

const double = (x: number): number => x * 2;

console.log("1+2 =", plus(1, 2));
console.log("1+2+3 =", plusPlus(1, 2, 3));
console.log("sum of 1 2 3 4:", total(1, 2, 3, 4));
console.log("apply(double, 5) =", apply(double, 5));
`,
    },
  },

  {
    id: "multiple_returns",
    title: "Multiple Return Values",
    intro: `<p>Often a function has more than one thing to say: a quotient <i>and</i> a remainder, a value
<i>and</i> whether it was found. Languages handle this with <b>tuples</b>, destructuring, or (in C)
structs and output parameters.</p>`,
    output: `3 7
7
17 / 5 = 3 remainder 2
`,
    code: {
      python: `# Returning several values really returns one tuple.
def vals():
    return 3, 7


def div_rem(n, d):
    return n // d, n % d


# Unpacking assigns each element to its own name.
a, b = vals()
print(a, b)

# _ is the conventional name for a value you don't need.
_, c = vals()
print(c)

q, r = div_rem(17, 5)
print(f"17 / 5 = {q} remainder {r}")
`,
      c: `#include <stdio.h>

/* C returns one value: return a struct... */
struct pair {
    int a, b;
};

static struct pair vals(void) { return (struct pair){3, 7}; }

/* ...or write results through pointer parameters. */
static void div_rem(int n, int d, int *q, int *r) {
    *q = n / d;
    *r = n % d;
}

int main(void) {
    struct pair p = vals();
    printf("%d %d\\n", p.a, p.b);

    printf("%d\\n", vals().b);

    int q, r;
    div_rem(17, 5, &q, &r); /* &q is the address of q */
    printf("17 / 5 = %d remainder %d\\n", q, r);
    return 0;
}
`,
      cpp: `#include <iostream>
#include <tuple>
#include <utility>

std::pair<int, int> vals() { return {3, 7}; }

std::pair<int, int> divRem(int n, int d) { return {n / d, n % d}; }

int main() {
    // Structured bindings (C++17) unpack a pair, tuple or struct.
    auto [a, b] = vals();
    std::cout << a << " " << b << "\\n";

    // std::tie assigns into existing variables; std::ignore skips one.
    int c;
    std::tie(std::ignore, c) = vals();
    std::cout << c << "\\n";

    auto [q, r] = divRem(17, 5);
    std::cout << "17 / 5 = " << q << " remainder " << r << "\\n";
}
`,
      go: `package main

import "fmt"

// (int, int) declares two results.
func vals() (int, int) {
	return 3, 7
}

// Named results are variables; a bare return returns them.
func divRem(n, d int) (q, r int) {
	q = n / d
	r = n % d
	return
}

func main() {
	a, b := vals()
	fmt.Println(a, b)

	// The blank identifier _ discards a value.
	_, c := vals()
	fmt.Println(c)

	q, r := divRem(17, 5)
	fmt.Printf("17 / 5 = %d remainder %d\\n", q, r)
}
`,
      rust: `// Return a tuple and destructure it.
fn vals() -> (i32, i32) {
    (3, 7)
}

fn div_rem(n: i32, d: i32) -> (i32, i32) {
    (n / d, n % d)
}

fn main() {
    let (a, b) = vals();
    println!("{} {}", a, b);

    let (_, c) = vals();
    println!("{}", c);

    let (q, r) = div_rem(17, 5);
    println!("17 / 5 = {} remainder {}", q, r);
}
`,
      haskell: `vals :: (Int, Int)
vals = (3, 7)

main :: IO ()
main = do
  -- Tuples are destructured with a pattern.
  let (a, b) = vals
  putStrLn (show a ++ " " ++ show b)

  let (_, c) = vals
  print c

  -- quotRem is built in and returns (quotient, remainder).
  let (q, r) = (17 :: Int) \`quotRem\` 5
  putStrLn ("17 / 5 = " ++ show q ++ " remainder " ++ show r)
`,
      javascript: `// Return an array and destructure it...
function vals() {
  return [3, 7];
}

const [a, b] = vals();
console.log(a, b);

// Leave a slot empty to skip an element.
const [, c] = vals();
console.log(c);

// ...or return an object and destructure by name.
function divRem(n, d) {
  return { q: Math.trunc(n / d), r: n % d };
}

const { q, r } = divRem(17, 5);
console.log(\`17 / 5 = \${q} remainder \${r}\`);
`,
      typescript: `// [number, number] is a tuple type: exactly two numbers.
function vals(): [number, number] {
  return [3, 7];
}

const [a, b] = vals();
console.log(a, b);

const [, c] = vals();
console.log(c);

function divRem(n: number, d: number): { q: number; r: number } {
  return { q: Math.trunc(n / d), r: n % d };
}

const { q, r } = divRem(17, 5);
console.log(\`17 / 5 = \${q} remainder \${r}\`);
`,
    },
  },

  {
    id: "closures",
    title: "Closures",
    intro: `<p>A <b>closure</b> is a function that remembers variables from the place where it was created.
Below, <code>intSeq</code> returns a counter function; each counter keeps its own private
<code>i</code>.</p>
<p>C has no closures, so the state lives in a struct you pass explicitly. In Haskell values never change,
so the counter uses a mutable reference cell (<code>IORef</code>).</p>`,
    output: `1
2
3
1
`,
    code: {
      python: `def int_seq():
    i = 0

    def next_int():
        # nonlocal: assign to the enclosing function's i, not a new local.
        nonlocal i
        i += 1
        return i

    return next_int


next_int = int_seq()
print(next_int())
print(next_int())
print(next_int())

# A new counter starts with its own fresh i.
new_ints = int_seq()
print(new_ints())
`,
      c: `#include <stdio.h>

/* C has no closures. Keep the "captured" state in a struct and pass a
   pointer to it explicitly. */
struct counter {
    int i;
};

static int next_int(struct counter *c) { return ++c->i; }

int main(void) {
    struct counter c = {0};
    printf("%d\\n", next_int(&c));
    printf("%d\\n", next_int(&c));
    printf("%d\\n", next_int(&c));

    struct counter fresh = {0};
    printf("%d\\n", next_int(&fresh));
    return 0;
}
`,
      cpp: `#include <functional>
#include <iostream>

std::function<int()> intSeq() {
    int i = 0;
    // [i] captures a copy of i; mutable lets the lambda change its copy.
    return [i]() mutable { return ++i; };
}

int main() {
    auto nextInt = intSeq();
    std::cout << nextInt() << "\\n";
    std::cout << nextInt() << "\\n";
    std::cout << nextInt() << "\\n";

    auto newInts = intSeq();
    std::cout << newInts() << "\\n";
}
`,
      go: `package main

import "fmt"

// intSeq returns a function that closes over i.
func intSeq() func() int {
	i := 0
	return func() int {
		i++
		return i
	}
}

func main() {
	nextInt := intSeq()
	fmt.Println(nextInt())
	fmt.Println(nextInt())
	fmt.Println(nextInt())

	newInts := intSeq()
	fmt.Println(newInts())
}
`,
      rust: `// impl FnMut() -> i32: "some closure that may change its captured state".
fn int_seq() -> impl FnMut() -> i32 {
    let mut i = 0;
    // move gives the closure ownership of i, so i outlives int_seq.
    move || {
        i += 1;
        i
    }
}

fn main() {
    let mut next_int = int_seq();
    println!("{}", next_int());
    println!("{}", next_int());
    println!("{}", next_int());

    let mut new_ints = int_seq();
    println!("{}", new_ints());
}
`,
      haskell: `import Data.IORef

-- intSeq creates a mutable cell and returns an action that bumps it.
-- The returned action "closes over" its own ref.
intSeq :: IO (IO Int)
intSeq = do
  ref <- newIORef 0
  return $ do
    modifyIORef ref (+ 1)
    readIORef ref

main :: IO ()
main = do
  nextInt <- intSeq
  nextInt >>= print
  nextInt >>= print
  nextInt >>= print

  newInts <- intSeq
  newInts >>= print
`,
      javascript: `function intSeq() {
  let i = 0;
  // The arrow function keeps i alive after intSeq returns.
  return () => ++i;
}

const nextInt = intSeq();
console.log(nextInt());
console.log(nextInt());
console.log(nextInt());

const newInts = intSeq();
console.log(newInts());
`,
      typescript: `// The return type () => number is a function taking nothing.
function intSeq(): () => number {
  let i = 0;
  return () => ++i;
}

const nextInt = intSeq();
console.log(nextInt());
console.log(nextInt());
console.log(nextInt());

const newInts = intSeq();
console.log(newInts());
`,
    },
  },

  {
    id: "recursion",
    title: "Recursion",
    intro: `<p>A <b>recursive</b> function calls itself on a smaller version of the problem until it
reaches a <i>base case</i> it can answer directly.</p>
<p><code>fact(n) = n × fact(n−1)</code> stops at <code>fact(0) = 1</code>. The naive
<code>fib</code> below is elegant but slow (it recomputes the same values); try
<code>fib(30)</code> and feel the difference between languages.</p>`,
    output: `fact(7) = 5040
fib(10) = 55
`,
    code: {
      python: `def fact(n):
    if n == 0:  # base case
        return 1
    return n * fact(n - 1)


def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)


print("fact(7) =", fact(7))
print("fib(10) =", fib(10))
`,
      c: `#include <stdio.h>

static long fact(int n) {
    if (n == 0) return 1; /* base case */
    return n * fact(n - 1);
}

static int fib(int n) {
    if (n < 2) return n;
    return fib(n - 1) + fib(n - 2);
}

int main(void) {
    printf("fact(7) = %ld\\n", fact(7));
    printf("fib(10) = %d\\n", fib(10));
    return 0;
}
`,
      cpp: `#include <functional>
#include <iostream>

long fact(int n) {
    if (n == 0) return 1; // base case
    return n * fact(n - 1);
}

int main() {
    std::cout << "fact(7) = " << fact(7) << "\\n";

    // A recursive lambda must refer to itself through a named std::function.
    std::function<int(int)> fib = [&fib](int n) {
        return n < 2 ? n : fib(n - 1) + fib(n - 2);
    };
    std::cout << "fib(10) = " << fib(10) << "\\n";
}
`,
      go: `package main

import "fmt"

func fact(n int) int {
	if n == 0 { // base case
		return 1
	}
	return n * fact(n-1)
}

func main() {
	fmt.Println("fact(7) =", fact(7))

	// A recursive closure must be declared before it's defined,
	// so its body can refer to fib.
	var fib func(n int) int
	fib = func(n int) int {
		if n < 2 {
			return n
		}
		return fib(n-1) + fib(n-2)
	}
	fmt.Println("fib(10) =", fib(10))
}
`,
      rust: `fn fact(n: u64) -> u64 {
    if n == 0 {
        1 // base case
    } else {
        n * fact(n - 1)
    }
}

fn fib(n: u32) -> u32 {
    match n {
        0 | 1 => n,
        _ => fib(n - 1) + fib(n - 2),
    }
}

fn main() {
    println!("fact(7) = {}", fact(7));
    println!("fib(10) = {}", fib(10));
}
`,
      haskell: `-- Each equation handles one shape of input; the first match wins.
fact :: Integer -> Integer
fact 0 = 1 -- base case
fact n = n * fact (n - 1)

fib :: Int -> Int
fib n
  | n < 2 = n
  | otherwise = fib (n - 1) + fib (n - 2)

main :: IO ()
main = do
  putStrLn ("fact(7) = " ++ show (fact 7))
  putStrLn ("fib(10) = " ++ show (fib 10))
`,
      javascript: `function fact(n) {
  if (n === 0) return 1; // base case
  return n * fact(n - 1);
}

const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));

console.log("fact(7) =", fact(7));
console.log("fib(10) =", fib(10));
`,
      typescript: `function fact(n: number): number {
  if (n === 0) return 1; // base case
  return n * fact(n - 1);
}

// Recursive functions need an explicit return type.
const fib = (n: number): number => (n < 2 ? n : fib(n - 1) + fib(n - 2));

console.log("fact(7) =", fact(7));
console.log("fib(10) =", fib(10));
`,
    },
  },
];
