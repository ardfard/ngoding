// Lessons 1–7: printing, values, variables, constants, loops, branching.
// Each lesson's examples must print exactly `output` in every language
// (checked by test/lessons-run.mjs).

export default [
  {
    id: "hello_world",
    title: "Hello World",
    intro: `<p>Every journey starts by printing a line. Press <b>Run</b> (or <kbd>Ctrl-Enter</kbd>) to save the
file, compile it if the language needs that, and run it in the shell below.</p>
<p>Edit the message and run it again. Your changes are kept in this browser.</p>`,
    output: "Hello, world!\n",
    code: {
      python: `# print writes its arguments followed by a newline.
print("Hello, world!")
`,
      c: `/* stdio.h declares printf and puts. */
#include <stdio.h>

/* Execution starts in main; returning 0 means success. */
int main(void) {
    printf("Hello, world!\\n");
    return 0;
}
`,
      cpp: `// <iostream> provides std::cout, the standard output stream.
#include <iostream>

int main() {
    // << pushes values into the stream; std::endl ends the line.
    std::cout << "Hello, world!" << std::endl;
}
`,
      go: `// Executables live in package main and start at func main.
package main

import "fmt"

func main() {
	fmt.Println("Hello, world!")
}
`,
      rust: `fn main() {
    // println! is a macro (note the !) that prints a line.
    println!("Hello, world!");
}
`,
      haskell: `-- main is an IO action: a description of what the program does.
main :: IO ()
main = putStrLn "Hello, world!"
`,
      javascript: `// console.log prints its arguments followed by a newline.
console.log("Hello, world!");
`,
      typescript: `// TypeScript is JavaScript plus types; this line needs none.
console.log("Hello, world!");
`,
    },
  },

  {
    id: "values",
    title: "Values",
    intro: `<p>Programs work with values: <b>strings</b> of text, <b>integers</b>, <b>floating-point</b>
numbers and <b>booleans</b>. Each language has operators to combine them.</p>
<p>Notice how integer division differs: some languages need a special operator or a
conversion to get <code>3.5</code> out of <code>7 / 2</code>.</p>`,
    output: `ngoding
1+1 = 2
7.0/2.0 = 3.5
7/2 = 3
true
false
true
`,
    code: {
      python: `# Strings can be joined with +.
print("ngo" + "ding")

# Integers and floats.
print("1+1 =", 1 + 1)
print("7.0/2.0 =", 7.0 / 2.0)
# / always gives a float; // is integer (floor) division.
print("7/2 =", 7 // 2)

# Booleans are True and False; print them lowercase to match the others.
print(str(True).lower())
print(str(True and False).lower())
print(str(True or False).lower())
`,
      c: `#include <stdbool.h>
#include <stdio.h>

int main(void) {
    /* Adjacent string literals are joined by the compiler. */
    printf("%s\\n", "ngo" "ding");

    printf("1+1 = %d\\n", 1 + 1);
    printf("7.0/2.0 = %.1f\\n", 7.0 / 2.0);
    /* Dividing two ints truncates. */
    printf("7/2 = %d\\n", 7 / 2);

    /* C has no bool formatting; pick the word ourselves. */
    printf("%s\\n", true ? "true" : "false");
    printf("%s\\n", (true && false) ? "true" : "false");
    printf("%s\\n", (true || false) ? "true" : "false");
    return 0;
}
`,
      cpp: `#include <iostream>
#include <string>

int main() {
    // std::string supports + for concatenation.
    std::cout << std::string("ngo") + "ding" << "\\n";

    std::cout << "1+1 = " << 1 + 1 << "\\n";
    std::cout << "7.0/2.0 = " << 7.0 / 2.0 << "\\n";
    std::cout << "7/2 = " << 7 / 2 << "\\n";

    // std::boolalpha prints bools as true/false instead of 1/0.
    std::cout << std::boolalpha;
    std::cout << true << "\\n";
    std::cout << (true && false) << "\\n";
    std::cout << (true || false) << "\\n";
}
`,
      go: `package main

import "fmt"

func main() {
	fmt.Println("ngo" + "ding")

	fmt.Println("1+1 =", 1+1)
	fmt.Println("7.0/2.0 =", 7.0/2.0)
	// Integer operands give an integer result.
	fmt.Println("7/2 =", 7/2)

	fmt.Println(true)
	fmt.Println(true && false)
	fmt.Println(true || false)
}
`,
      rust: `fn main() {
    // A String owns its text; + appends a &str to it.
    let s = String::from("ngo") + "ding";
    println!("{}", s);

    println!("1+1 = {}", 1 + 1);
    // {:.1} prints one digit after the decimal point.
    println!("7.0/2.0 = {:.1}", 7.0 / 2.0);
    println!("7/2 = {}", 7 / 2);

    println!("{}", true);
    println!("{}", true && false);
    println!("{}", true || false);
}
`,
      haskell: `import Data.Char (toLower)

-- show turns a value into a String; Haskell prints Bools as True/False,
-- so lowercase them to match the other languages.
showBool :: Bool -> String
showBool = map toLower . show

main :: IO ()
main = do
  putStrLn ("ngo" ++ "ding")
  putStrLn ("1+1 = " ++ show (1 + 1))
  putStrLn ("7.0/2.0 = " ++ show (7.0 / 2.0))
  -- / is only for fractional numbers; div is integer division.
  putStrLn ("7/2 = " ++ show (7 \`div\` 2))
  putStrLn (showBool True)
  putStrLn (showBool (True && False))
  putStrLn (showBool (True || False))
`,
      javascript: `console.log("ngo" + "ding");

console.log("1+1 =", 1 + 1);
// All numbers are floats; toFixed formats with a fixed number of decimals.
console.log("7.0/2.0 =", (7.0 / 2.0).toFixed(1));
// Math.trunc drops the fractional part.
console.log("7/2 =", Math.trunc(7 / 2));

console.log(true);
console.log(true && false);
console.log(true || false);
`,
      typescript: `const joined: string = "ngo" + "ding";
console.log(joined);

// number covers both integers and floats.
const sum: number = 1 + 1;
console.log("1+1 =", sum);
console.log("7.0/2.0 =", (7.0 / 2.0).toFixed(1));
console.log("7/2 =", Math.trunc(7 / 2));

const yes: boolean = true;
console.log(yes);
console.log(yes && false);
console.log(yes || false);
`,
    },
  },

  {
    id: "variables",
    title: "Variables",
    intro: `<p>A <b>variable</b> gives a name to a value. Statically typed languages fix the variable's
type when it is declared (often inferred from the initial value); dynamic ones don't.</p>
<p>Some languages make variables immutable by default: Rust needs <code>mut</code> to allow
reassignment, and in Haskell names are bound once and never change.</p>`,
    output: `initial
1 2
true
0
apple
`,
    code: {
      python: `# Assignment creates the variable; no declaration needed.
a = "initial"
print(a)

# Several at once.
b, c = 1, 2
print(b, c)

d = True
print(str(d).lower())

# Python has no "zero value": set it explicitly.
e = 0
print(e)

# Variables can be reassigned.
f = "short"
f = "apple"
print(f)
`,
      c: `#include <stdio.h>

int main(void) {
    const char *a = "initial";
    printf("%s\\n", a);

    int b = 1, c = 2;
    printf("%d %d\\n", b, c);

    int d = 1; /* C89-style boolean: nonzero is true */
    printf("%s\\n", d ? "true" : "false");

    /* Locals are NOT zeroed automatically: always initialize. */
    int e = 0;
    printf("%d\\n", e);

    const char *f = "short";
    f = "apple";
    printf("%s\\n", f);
    return 0;
}
`,
      cpp: `#include <iostream>
#include <string>

int main() {
    std::string a = "initial";
    std::cout << a << "\\n";

    int b = 1, c = 2;
    std::cout << b << " " << c << "\\n";

    // auto infers the type from the initializer.
    auto d = true;
    std::cout << std::boolalpha << d << "\\n";

    // {} value-initializes: 0 for an int.
    int e{};
    std::cout << e << "\\n";

    std::string f = "short";
    f = "apple";
    std::cout << f << "\\n";
}
`,
      go: `package main

import "fmt"

func main() {
	// var declares one or more variables.
	var a = "initial"
	fmt.Println(a)

	var b, c int = 1, 2
	fmt.Println(b, c)

	// Go infers the type from the initial value.
	var d = true
	fmt.Println(d)

	// Without an initializer a variable gets its zero value.
	var e int
	fmt.Println(e)

	// := declares and initializes in one step (inside functions only).
	f := "short"
	f = "apple"
	fmt.Println(f)
}
`,
      rust: `fn main() {
    let a = "initial";
    println!("{}", a);

    // A tuple pattern binds several names at once.
    let (b, c) = (1, 2);
    println!("{} {}", b, c);

    let d: bool = true;
    println!("{}", d);

    // Rust refuses to read uninitialized variables, so give a value.
    let e: i32 = 0;
    println!("{}", e);

    // Bindings are immutable unless declared mut.
    let mut f = String::from("app");
    f.push_str("le");
    println!("{}", f);
}
`,
      haskell: `import Data.Char (toLower)

main :: IO ()
main = do
  -- let binds a name to a value. It can't be reassigned.
  let a = "initial"
  putStrLn a

  let (b, c) = (1, 2) :: (Int, Int)
  putStrLn (show b ++ " " ++ show c)

  let d = True
  putStrLn (map toLower (show d))

  let e = 0 :: Int
  print e

  -- A second let shadows the old name instead of changing it.
  let f = "short"
  let f = "apple"
  putStrLn f
`,
      javascript: `// let declares a variable that can be reassigned.
let a = "initial";
console.log(a);

let b = 1, c = 2;
console.log(b, c);

let d = true;
console.log(d);

// Without a value a variable is undefined, so set it.
let e = 0;
console.log(e);

let f = "short";
f = "apple";
console.log(f);
`,
      typescript: `let a = "initial"; // inferred as string
console.log(a);

let b: number = 1, c: number = 2;
console.log(b, c);

let d: boolean = true;
console.log(d);

let e: number = 0;
console.log(e);

let f = "short";
f = "apple"; // OK: still a string
// f = 42;   // error: number is not assignable to string
console.log(f);
`,
    },
  },

  {
    id: "constants",
    title: "Constants",
    intro: `<p>A <b>constant</b> is a name whose value never changes. Constants make intent clear and let the
compiler catch accidental reassignment.</p>
<p>Try reassigning one of the constants below and run it again to see the error each language gives.</p>`,
    output: `constant
600000000000
-0.28470407323754404
`,
    code: {
      python: `import math

# Python has no true constants; UPPER_CASE names say "don't change me".
S = "constant"
print(S)

N = 500000000
D = 3e20 / N
print(int(D))
print(math.sin(N))
`,
      c: `#include <math.h>
#include <stdio.h>

/* A preprocessor constant and a typed const variable. */
#define S "constant"
static const long long N = 500000000;

int main(void) {
    printf("%s\\n", S);
    const double d = 3e20 / N;
    printf("%lld\\n", (long long)d);
    printf("%.17g\\n", sin((double)N));
    return 0;
}
`,
      cpp: `#include <cmath>
#include <cstdio>
#include <iostream>

// constexpr values are computed at compile time.
constexpr const char *S = "constant";
constexpr long long N = 500000000;

int main() {
    std::cout << S << "\\n";
    constexpr double d = 3e20 / N;
    std::cout << static_cast<long long>(d) << "\\n";
    std::printf("%.17g\\n", std::sin(static_cast<double>(N)));
}
`,
      go: `package main

import (
	"fmt"
	"math"
)

const s string = "constant"

func main() {
	fmt.Println(s)

	// Numeric constants have arbitrary precision until given a type.
	const n = 500000000
	const d = 3e20 / n
	fmt.Println(int64(d))

	// A constant takes the type its context needs: here, float64.
	fmt.Println(math.Sin(n))
}
`,
      rust: `// const items need an explicit type.
const S: &str = "constant";
const N: i64 = 500000000;

fn main() {
    println!("{}", S);
    let d = 3e20 / N as f64;
    println!("{}", d as i64);
    println!("{}", (N as f64).sin());
}
`,
      haskell: `-- Top-level bindings are constants: nothing in Haskell can change them.
s :: String
s = "constant"

n :: Integer
n = 500000000

main :: IO ()
main = do
  putStrLn s
  let d = 3e20 / fromIntegral n :: Double
  print (truncate d :: Integer)
  print (sin (fromIntegral n) :: Double)
`,
      javascript: `// const forbids reassigning the name.
const s = "constant";
console.log(s);

const n = 500000000;
const d = 3e20 / n;
console.log(Math.trunc(d));
console.log(Math.sin(n));
`,
      typescript: `const s: string = "constant";
console.log(s);

const n = 500000000;
const d: number = 3e20 / n;
console.log(Math.trunc(d));
console.log(Math.sin(n));
`,
    },
  },

  {
    id: "loops",
    title: "Loops",
    intro: `<p>Loops repeat work. The classic shapes are: loop while a condition holds, loop a counted
number of times, and loop forever until you <code>break</code>. <code>continue</code> skips to the
next iteration.</p>
<p>Haskell has no loop statement: repetition is written with recursion or by mapping over a list.</p>`,
    output: `1
2
3
0
1
2
loop
1
3
5
`,
    code: {
      python: `# A while loop with a condition.
i = 1
while i <= 3:
    print(i)
    i += 1

# range(3) yields 0, 1, 2.
for j in range(3):
    print(j)

# Loop until break.
while True:
    print("loop")
    break

# continue skips the rest of this iteration.
for n in range(6):
    if n % 2 == 0:
        continue
    print(n)
`,
      c: `#include <stdio.h>

int main(void) {
    int i = 1;
    while (i <= 3) {
        printf("%d\\n", i);
        i++;
    }

    for (int j = 0; j < 3; j++) {
        printf("%d\\n", j);
    }

    for (;;) {
        printf("loop\\n");
        break;
    }

    for (int n = 0; n < 6; n++) {
        if (n % 2 == 0) continue;
        printf("%d\\n", n);
    }
    return 0;
}
`,
      cpp: `#include <iostream>

int main() {
    int i = 1;
    while (i <= 3) {
        std::cout << i << "\\n";
        ++i;
    }

    for (int j = 0; j < 3; ++j) {
        std::cout << j << "\\n";
    }

    while (true) {
        std::cout << "loop\\n";
        break;
    }

    for (int n = 0; n < 6; ++n) {
        if (n % 2 == 0) continue;
        std::cout << n << "\\n";
    }
}
`,
      go: `package main

import "fmt"

func main() {
	// for is Go's only loop keyword. With a condition it acts like while.
	i := 1
	for i <= 3 {
		fmt.Println(i)
		i = i + 1
	}

	// The classic init; condition; post form.
	for j := 0; j < 3; j++ {
		fmt.Println(j)
	}

	// No condition: loop until break or return.
	for {
		fmt.Println("loop")
		break
	}

	for n := 0; n < 6; n++ {
		if n%2 == 0 {
			continue
		}
		fmt.Println(n)
	}
}
`,
      rust: `fn main() {
    let mut i = 1;
    while i <= 3 {
        println!("{}", i);
        i += 1;
    }

    // 0..3 is a range: 0, 1, 2 (end excluded).
    for j in 0..3 {
        println!("{}", j);
    }

    // loop runs forever until break.
    loop {
        println!("loop");
        break;
    }

    for n in 0..6 {
        if n % 2 == 0 {
            continue;
        }
        println!("{}", n);
    }
}
`,
      haskell: `-- mapM_ runs an IO action for every element of a list.
-- [1..3] is the list 1, 2, 3.
main :: IO ()
main = do
  mapM_ print [1 .. 3 :: Int]

  -- A loop is a function that calls itself.
  let go j = if j < 3 then print j >> go (j + 1) else return ()
  go (0 :: Int)

  putStrLn "loop"

  -- Filter instead of continue.
  mapM_ print [n | n <- [0 .. 5 :: Int], odd n]
`,
      javascript: `let i = 1;
while (i <= 3) {
  console.log(i);
  i++;
}

for (let j = 0; j < 3; j++) {
  console.log(j);
}

for (;;) {
  console.log("loop");
  break;
}

for (let n = 0; n < 6; n++) {
  if (n % 2 === 0) continue;
  console.log(n);
}
`,
      typescript: `let i: number = 1;
while (i <= 3) {
  console.log(i);
  i++;
}

for (let j = 0; j < 3; j++) {
  console.log(j);
}

while (true) {
  console.log("loop");
  break;
}

for (let n = 0; n < 6; n++) {
  if (n % 2 === 0) continue;
  console.log(n);
}
`,
    },
  },

  {
    id: "if_else",
    title: "If/Else",
    intro: `<p><code>if</code> runs code only when a condition is true; <code>else</code> handles the other
case, and chains of <code>else if</code> test several conditions in order.</p>
<p>In expression-oriented languages (Rust, Haskell) <code>if</code> produces a value, so it can be used
on the right of an assignment. Others offer the ternary <code>cond ? a : b</code> for that.</p>`,
    output: `7 is odd
8 is divisible by 4
9 has 1 digit
small
`,
    code: {
      python: `if 7 % 2 == 0:
    print("7 is even")
else:
    print("7 is odd")

if 8 % 4 == 0:
    print("8 is divisible by 4")

num = 9
if num < 0:
    print(num, "is negative")
elif num < 10:
    print(num, "has 1 digit")
else:
    print(num, "has multiple digits")

# A conditional expression yields a value.
size = "small" if num < 100 else "big"
print(size)
`,
      c: `#include <stdio.h>

int main(void) {
    if (7 % 2 == 0) {
        printf("7 is even\\n");
    } else {
        printf("7 is odd\\n");
    }

    if (8 % 4 == 0) {
        printf("8 is divisible by 4\\n");
    }

    int num = 9;
    if (num < 0) {
        printf("%d is negative\\n", num);
    } else if (num < 10) {
        printf("%d has 1 digit\\n", num);
    } else {
        printf("%d has multiple digits\\n", num);
    }

    /* The ternary operator is an if that yields a value. */
    const char *size = num < 100 ? "small" : "big";
    printf("%s\\n", size);
    return 0;
}
`,
      cpp: `#include <iostream>
#include <string>

int main() {
    if (7 % 2 == 0) {
        std::cout << "7 is even\\n";
    } else {
        std::cout << "7 is odd\\n";
    }

    if (8 % 4 == 0) {
        std::cout << "8 is divisible by 4\\n";
    }

    // C++17: a variable can be declared inside the if, scoped to it.
    if (int num = 9; num < 0) {
        std::cout << num << " is negative\\n";
    } else if (num < 10) {
        std::cout << num << " has 1 digit\\n";
    } else {
        std::cout << num << " has multiple digits\\n";
    }

    std::string size = 9 < 100 ? "small" : "big";
    std::cout << size << "\\n";
}
`,
      go: `package main

import "fmt"

func main() {
	// No parentheses around the condition, but braces are required.
	if 7%2 == 0 {
		fmt.Println("7 is even")
	} else {
		fmt.Println("7 is odd")
	}

	if 8%4 == 0 {
		fmt.Println("8 is divisible by 4")
	}

	// A statement can precede the condition; num is scoped to the if.
	if num := 9; num < 0 {
		fmt.Println(num, "is negative")
	} else if num < 10 {
		fmt.Println(num, "has 1 digit")
	} else {
		fmt.Println(num, "has multiple digits")
	}

	// Go has no ternary operator: use a plain if.
	size := "big"
	if 9 < 100 {
		size = "small"
	}
	fmt.Println(size)
}
`,
      rust: `fn main() {
    if 7 % 2 == 0 {
        println!("7 is even");
    } else {
        println!("7 is odd");
    }

    if 8 % 4 == 0 {
        println!("8 is divisible by 4");
    }

    let num = 9;
    if num < 0 {
        println!("{} is negative", num);
    } else if num < 10 {
        println!("{} has 1 digit", num);
    } else {
        println!("{} has multiple digits", num);
    }

    // if is an expression: both branches must have the same type.
    let size = if num < 100 { "small" } else { "big" };
    println!("{}", size);
}
`,
      haskell: `import Control.Monad (when)

-- In Haskell, if always needs an else, because it must produce a value.
digits :: Int -> String
digits num
  -- Guards (|) read like a chain of else-ifs.
  | num < 0 = show num ++ " is negative"
  | num < 10 = show num ++ " has 1 digit"
  | otherwise = show num ++ " has multiple digits"

main :: IO ()
main = do
  putStrLn (if 7 \`mod\` 2 == 0 then "7 is even" else "7 is odd")

  -- when runs an action only if the condition holds.
  when (8 \`mod\` 4 == 0) $ putStrLn "8 is divisible by 4"

  putStrLn (digits 9)

  let size = if (9 :: Int) < 100 then "small" else "big"
  putStrLn size
`,
      javascript: `if (7 % 2 === 0) {
  console.log("7 is even");
} else {
  console.log("7 is odd");
}

if (8 % 4 === 0) {
  console.log("8 is divisible by 4");
}

const num = 9;
if (num < 0) {
  console.log(num, "is negative");
} else if (num < 10) {
  console.log(num, "has 1 digit");
} else {
  console.log(num, "has multiple digits");
}

// === compares without type conversion; prefer it over ==.
const size = num < 100 ? "small" : "big";
console.log(size);
`,
      typescript: `if (7 % 2 === 0) {
  console.log("7 is even");
} else {
  console.log("7 is odd");
}

if (8 % 4 === 0) {
  console.log("8 is divisible by 4");
}

const num: number = 9;
if (num < 0) {
  console.log(num, "is negative");
} else if (num < 10) {
  console.log(num, "has 1 digit");
} else {
  console.log(num, "has multiple digits");
}

// The type is the union of both branches: "small" | "big".
const size = num < 100 ? "small" : "big";
console.log(size);
`,
    },
  },

  {
    id: "switch",
    title: "Switch",
    intro: `<p>A <b>switch</b> (or <b>match</b>) picks one branch by comparing a value against several cases.
It's clearer than a long chain of <code>else if</code>s.</p>
<p>Watch out for <i>fallthrough</i>: in C, C++, JavaScript and TypeScript a case keeps running into the next one
unless you <code>break</code>. Go, Rust, Python and Haskell stop at the end of each case.</p>`,
    output: `Write 2 as two
It's a weekday
4 is even
`,
    code: {
      python: `def name(i):
    # match (Python 3.10+) compares against each pattern in order.
    match i:
        case 1:
            return "one"
        case 2:
            return "two"
        case 3:
            return "three"
        case _:  # _ matches anything
            return "many"

print("Write 2 as", name(2))

day = "Tue"
match day:
    case "Sat" | "Sun":  # | matches either pattern
        print("It's the weekend")
    case _:
        print("It's a weekday")

n = 4
match n % 2:
    case 0:
        print(n, "is even")
    case _:
        print(n, "is odd")
`,
      c: `#include <stdio.h>
#include <string.h>

static const char *name(int i) {
    switch (i) {
    case 1: return "one";
    case 2: return "two";
    case 3: return "three";
    default: return "many";
    }
}

int main(void) {
    printf("Write 2 as %s\\n", name(2));

    /* C can only switch on integers, so compare strings with strcmp. */
    const char *day = "Tue";
    if (strcmp(day, "Sat") == 0 || strcmp(day, "Sun") == 0) {
        printf("It's the weekend\\n");
    } else {
        printf("It's a weekday\\n");
    }

    int n = 4;
    switch (n % 2) {
    case 0:
        printf("%d is even\\n", n);
        break; /* without break, execution falls into the next case */
    default:
        printf("%d is odd\\n", n);
    }
    return 0;
}
`,
      cpp: `#include <iostream>
#include <string>

std::string name(int i) {
    switch (i) {
    case 1: return "one";
    case 2: return "two";
    case 3: return "three";
    default: return "many";
    }
}

enum class Day { Mon, Tue, Sat, Sun };

int main() {
    std::cout << "Write 2 as " << name(2) << "\\n";

    Day day = Day::Tue;
    switch (day) {
    case Day::Sat:
    case Day::Sun: // empty case falls through: Sat or Sun
        std::cout << "It's the weekend\\n";
        break;
    default:
        std::cout << "It's a weekday\\n";
    }

    int n = 4;
    switch (n % 2) {
    case 0:
        std::cout << n << " is even\\n";
        break;
    default:
        std::cout << n << " is odd\\n";
    }
}
`,
      go: `package main

import "fmt"

func main() {
	i := 2
	fmt.Print("Write ", i, " as ")
	switch i {
	case 1:
		fmt.Println("one")
	case 2:
		fmt.Println("two")
	case 3:
		fmt.Println("three")
	}

	// Commas list several values in one case.
	switch "Tue" {
	case "Sat", "Sun":
		fmt.Println("It's the weekend")
	default:
		fmt.Println("It's a weekday")
	}

	// A switch with no value is a cleaner if/else chain.
	n := 4
	switch {
	case n%2 == 0:
		fmt.Println(n, "is even")
	default:
		fmt.Println(n, "is odd")
	}
}
`,
      rust: `fn name(i: i32) -> &'static str {
    // match must cover every possible value; _ is the catch-all.
    match i {
        1 => "one",
        2 => "two",
        3 => "three",
        _ => "many",
    }
}

fn main() {
    println!("Write 2 as {}", name(2));

    let day = "Tue";
    match day {
        "Sat" | "Sun" => println!("It's the weekend"),
        _ => println!("It's a weekday"),
    }

    let n = 4;
    // Guards add a condition to a pattern.
    match n {
        x if x % 2 == 0 => println!("{} is even", x),
        x => println!("{} is odd", x),
    }
}
`,
      haskell: `name :: Int -> String
name i = case i of
  1 -> "one"
  2 -> "two"
  3 -> "three"
  _ -> "many"

-- Functions can pattern-match their arguments directly.
kind :: String -> String
kind "Sat" = "It's the weekend"
kind "Sun" = "It's the weekend"
kind _ = "It's a weekday"

main :: IO ()
main = do
  putStrLn ("Write 2 as " ++ name 2)
  putStrLn (kind "Tue")
  let n = 4 :: Int
  putStrLn $ case n \`mod\` 2 of
    0 -> show n ++ " is even"
    _ -> show n ++ " is odd"
`,
      javascript: `function numberName(i) {
  switch (i) {
    case 1: return "one";
    case 2: return "two";
    case 3: return "three";
    default: return "many";
  }
}

console.log("Write 2 as", numberName(2));

const day = "Tue";
switch (day) {
  case "Sat":
  case "Sun":
    console.log("It's the weekend");
    break;
  default:
    console.log("It's a weekday");
}

const n = 4;
switch (n % 2) {
  case 0:
    console.log(n, "is even");
    break; // forget this and the next case runs too
  default:
    console.log(n, "is odd");
}
`,
      typescript: `type Day = "Mon" | "Tue" | "Sat" | "Sun";

function numberName(i: number): string {
  switch (i) {
    case 1: return "one";
    case 2: return "two";
    case 3: return "three";
    default: return "many";
  }
}

console.log("Write 2 as", numberName(2));

// tsc checks that each case is a valid Day.
const day = "Tue" as Day;
switch (day) {
  case "Sat":
  case "Sun":
    console.log("It's the weekend");
    break;
  default:
    console.log("It's a weekday");
}

const n: number = 4;
switch (n % 2) {
  case 0:
    console.log(n, "is even");
    break;
  default:
    console.log(n, "is odd");
}
`,
    },
  },
];
