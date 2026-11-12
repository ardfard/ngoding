// Lessons: strings, structs, methods, interfaces, errors, sorting.

export default [
  {
    id: "strings",
    title: "Strings",
    intro: `<p>Text is a <b>string</b>: a sequence of characters. Every language ships functions for the
everyday jobs: length, case, searching, replacing, splitting and joining.</p>
<p>In C a string is just an array of <code>char</code> ending in <code>'\\0'</code>, so many of these
are loops you write yourself. In Haskell a <code>String</code> is a list of <code>Char</code>, so
list functions like <code>reverse</code> work on it directly.</p>`,
    output: `len: 5
upper: HELLO
contains ell: true
index of l: 2
replace l with x: hexxo
split and join: a-b-c
reversed: olleh
`,
    code: {
      python: `s = "hello"
print("len:", len(s))
print("upper:", s.upper())
print("contains ell:", str("ell" in s).lower())
print("index of l:", s.index("l"))
print("replace l with x:", s.replace("l", "x"))
print("split and join:", "-".join("a,b,c".split(",")))
# s[::-1] slices the whole string with step -1: backwards.
print("reversed:", s[::-1])
`,
      c: `#include <ctype.h>
#include <stdio.h>
#include <string.h>

int main(void) {
    const char *s = "hello";
    size_t n = strlen(s); /* counts chars up to the '\\0' */
    printf("len: %zu\\n", n);

    char buf[64];
    for (size_t i = 0; i <= n; i++) buf[i] = (char)toupper((unsigned char)s[i]);
    printf("upper: %s\\n", buf);

    printf("contains ell: %s\\n", strstr(s, "ell") ? "true" : "false");

    /* strchr returns a pointer; subtract the start to get an index. */
    printf("index of l: %d\\n", (int)(strchr(s, 'l') - s));

    for (size_t i = 0; i <= n; i++) buf[i] = s[i] == 'l' ? 'x' : s[i];
    printf("replace l with x: %s\\n", buf);

    /* strtok splits in place, so the input must be a writable array. */
    char csv[] = "a,b,c";
    printf("split and join: ");
    const char *sep = "";
    for (char *tok = strtok(csv, ","); tok; tok = strtok(NULL, ",")) {
        printf("%s%s", sep, tok);
        sep = "-";
    }
    printf("\\n");

    for (size_t i = 0; i < n; i++) buf[i] = s[n - 1 - i];
    buf[n] = '\\0'; /* terminate the new string */
    printf("reversed: %s\\n", buf);
    return 0;
}
`,
      cpp: `#include <algorithm>
#include <cctype>
#include <iostream>
#include <sstream>
#include <string>

int main() {
    std::string s = "hello";
    std::cout << "len: " << s.size() << "\\n";

    std::string up = s;
    std::transform(up.begin(), up.end(), up.begin(),
                   [](unsigned char c) { return std::toupper(c); });
    std::cout << "upper: " << up << "\\n";

    // find returns std::string::npos when there's no match.
    std::cout << std::boolalpha
              << "contains ell: " << (s.find("ell") != std::string::npos) << "\\n";
    std::cout << "index of l: " << s.find('l') << "\\n";

    std::string replaced = s;
    std::replace(replaced.begin(), replaced.end(), 'l', 'x');
    std::cout << "replace l with x: " << replaced << "\\n";

    // Split by reading from a stream up to each ','.
    std::istringstream in("a,b,c");
    std::string part, joined;
    while (std::getline(in, part, ',')) {
        if (!joined.empty()) joined += "-";
        joined += part;
    }
    std::cout << "split and join: " << joined << "\\n";

    // Build a string from reverse iterators.
    std::cout << "reversed: " << std::string(s.rbegin(), s.rend()) << "\\n";
}
`,
      go: `package main

import (
	"fmt"
	"strings"
)

func main() {
	s := "hello"
	// len counts bytes; for non-ASCII text use utf8.RuneCountInString.
	fmt.Println("len:", len(s))
	fmt.Println("upper:", strings.ToUpper(s))
	fmt.Println("contains ell:", strings.Contains(s, "ell"))
	fmt.Println("index of l:", strings.Index(s, "l"))
	fmt.Println("replace l with x:", strings.ReplaceAll(s, "l", "x"))
	fmt.Println("split and join:", strings.Join(strings.Split("a,b,c", ","), "-"))

	// Strings are immutable: reverse a slice of runes (characters) instead.
	r := []rune(s)
	for i, j := 0, len(r)-1; i < j; i, j = i+1, j-1 {
		r[i], r[j] = r[j], r[i]
	}
	fmt.Println("reversed:", string(r))
}
`,
      rust: `fn main() {
    // &str is a borrowed string slice; String is an owned, growable string.
    let s = "hello";
    println!("len: {}", s.len());
    println!("upper: {}", s.to_uppercase());
    println!("contains ell: {}", s.contains("ell"));

    // find returns Option<usize>: None when there's no match.
    match s.find('l') {
        Some(i) => println!("index of l: {}", i),
        None => println!("no l"),
    }

    println!("replace l with x: {}", s.replace("l", "x"));

    let parts: Vec<&str> = "a,b,c".split(',').collect();
    println!("split and join: {}", parts.join("-"));

    // chars() iterates characters; collect them back into a String.
    let reversed: String = s.chars().rev().collect();
    println!("reversed: {}", reversed);
}
`,
      haskell: `import Data.Char (toUpper)
import Data.List (elemIndex, intercalate, isInfixOf)

-- The Prelude has no split, so write one: break at the first c, recurse.
splitOn :: Char -> String -> [String]
splitOn c str = case break (== c) str of
  (chunk, []) -> [chunk]
  (chunk, _ : rest) -> chunk : splitOn c rest

main :: IO ()
main = do
  let s = "hello"
  putStrLn ("len: " ++ show (length s))
  putStrLn ("upper: " ++ map toUpper s)
  putStrLn ("contains ell: " ++ (if "ell" \`isInfixOf\` s then "true" else "false"))
  -- elemIndex returns Maybe Int: Nothing when there's no match.
  putStrLn ("index of l: " ++ maybe "none" show (elemIndex 'l' s))
  putStrLn ("replace l with x: " ++ map (\\ch -> if ch == 'l' then 'x' else ch) s)
  putStrLn ("split and join: " ++ intercalate "-" (splitOn ',' "a,b,c"))
  putStrLn ("reversed: " ++ reverse s)
`,
      javascript: `const s = "hello";
console.log("len:", s.length);
console.log("upper:", s.toUpperCase());
console.log("contains ell:", s.includes("ell"));
console.log("index of l:", s.indexOf("l"));
// A regex with the g flag replaces every match, not just the first.
console.log("replace l with x:", s.replace(/l/g, "x"));
console.log("split and join:", "a,b,c".split(",").join("-"));
// Spread into an array of characters, reverse, and join back.
console.log("reversed:", [...s].reverse().join(""));
`,
      typescript: `const s: string = "hello";
console.log("len:", s.length);
console.log("upper:", s.toUpperCase());
console.log("contains ell:", s.includes("ell"));
console.log("index of l:", s.indexOf("l"));
console.log("replace l with x:", s.replace(/l/g, "x"));
const parts: string[] = "a,b,c".split(",");
console.log("split and join:", parts.join("-"));
console.log("reversed:", [...s].reverse().join(""));
`,
    },
  },

  {
    id: "structs",
    title: "Structs & Records",
    intro: `<p>A <b>struct</b> (record, object) groups named fields into one value: a person has a
<code>name</code> <i>and</i> an <code>age</code>.</p>
<p>Notice how each language creates one, fills in default values, and changes a field. Haskell records
are immutable: "changing" a field makes a copy with the new value.</p>`,
    output: `Bob is 20
Alice is 30
Fred is 0
Sean
Ann is 51
`,
    code: {
      python: `from dataclasses import dataclass


# @dataclass writes __init__ (and more) from the field list.
@dataclass
class Person:
    name: str
    age: int = 0  # default value


def describe(p):
    return f"{p.name} is {p.age}"


print(describe(Person("Bob", 20)))
print(describe(Person(name="Alice", age=30)))
print(describe(Person("Fred")))

s = Person("Sean", 50)
print(s.name)

ann = Person("Ann", 50)
ann.age += 1
print(describe(ann))
`,
      c: `#include <stdio.h>

struct person {
    const char *name;
    int age;
};

static void describe(struct person p) { printf("%s is %d\\n", p.name, p.age); }

/* Passing a pointer lets the function change the caller's struct. */
static void birthday(struct person *p) { p->age++; }

int main(void) {
    describe((struct person){"Bob", 20});
    /* Designated initializers name the fields. */
    describe((struct person){.name = "Alice", .age = 30});
    /* Fields you leave out are zeroed. */
    describe((struct person){.name = "Fred"});

    struct person s = {"Sean", 50};
    printf("%s\\n", s.name);

    struct person ann = {"Ann", 50};
    birthday(&ann);
    describe(ann);
    return 0;
}
`,
      cpp: `#include <iostream>
#include <string>

struct Person {
    std::string name;
    int age = 0; // default member initializer
};

void describe(const Person &p) { std::cout << p.name << " is " << p.age << "\\n"; }

// A reference parameter (Person &) aliases the caller's object.
void birthday(Person &p) { p.age++; }

int main() {
    describe(Person{"Bob", 20});
    describe(Person{"Alice", 30});
    describe(Person{"Fred"});

    Person s{"Sean", 50};
    std::cout << s.name << "\\n";

    Person ann{"Ann", 50};
    birthday(ann);
    describe(ann);
}
`,
      go: `package main

import "fmt"

type person struct {
	name string
	age  int
}

func describe(p person) {
	fmt.Println(p.name, "is", p.age)
}

// A pointer parameter lets the function change the caller's struct.
func birthday(p *person) {
	p.age++
}

func main() {
	describe(person{"Bob", 20})
	describe(person{name: "Alice", age: 30})
	// Omitted fields get their zero value.
	describe(person{name: "Fred"})

	s := person{name: "Sean", age: 50}
	fmt.Println(s.name)

	ann := person{name: "Ann", age: 50}
	birthday(&ann)
	describe(ann)
}
`,
      rust: `// derive(Default) gives every field its default (0 for numbers).
#[derive(Default)]
struct Person {
    name: String,
    age: u32,
}

fn describe(p: &Person) {
    println!("{} is {}", p.name, p.age);
}

// &mut borrows the struct mutably so the function can change it.
fn birthday(p: &mut Person) {
    p.age += 1;
}

fn main() {
    describe(&Person { name: String::from("Bob"), age: 20 });
    describe(&Person { age: 30, name: String::from("Alice") });
    // ..Default::default() fills the remaining fields.
    describe(&Person { name: String::from("Fred"), ..Default::default() });

    let s = Person { name: String::from("Sean"), age: 50 };
    println!("{}", s.name);

    let mut ann = Person { name: String::from("Ann"), age: 50 };
    birthday(&mut ann);
    describe(&ann);
}
`,
      haskell: `-- Record syntax names the fields and creates accessor functions.
data Person = Person
  { name :: String,
    age :: Int
  }

describe :: Person -> String
describe p = name p ++ " is " ++ show (age p)

-- A "default" person to start from.
defaultPerson :: Person
defaultPerson = Person {name = "", age = 0}

main :: IO ()
main = do
  putStrLn (describe (Person "Bob" 20))
  putStrLn (describe Person {name = "Alice", age = 30})
  putStrLn (describe defaultPerson {name = "Fred"})

  let s = Person "Sean" 50
  putStrLn (name s)

  -- Record update syntax builds a copy with one field changed.
  let ann = Person "Ann" 50
      ann' = ann {age = age ann + 1}
  putStrLn (describe ann')
`,
      javascript: `// An object literal groups named fields.
function person(name, age = 0) {
  return { name, age }; // short for { name: name, age: age }
}

function describe(p) {
  console.log(p.name, "is", p.age);
}

describe(person("Bob", 20));
describe({ name: "Alice", age: 30 });
describe(person("Fred"));

const s = person("Sean", 50);
console.log(s.name);

const ann = person("Ann", 50);
ann.age++;
describe(ann);
`,
      typescript: `// An interface describes the shape of an object.
interface Person {
  name: string;
  age: number;
}

function person(name: string, age: number = 0): Person {
  return { name, age };
}

function describe(p: Person): void {
  console.log(p.name, "is", p.age);
}

describe(person("Bob", 20));
describe({ name: "Alice", age: 30 });
// describe({ name: "Zed" }); // error: property 'age' is missing
describe(person("Fred"));

const s = person("Sean", 50);
console.log(s.name);

const ann = person("Ann", 50);
ann.age++;
describe(ann);
`,
    },
  },

  {
    id: "methods",
    title: "Methods",
    intro: `<p>A <b>method</b> is a function attached to a type, called as <code>value.method()</code>.
Methods keep the operations on a type next to its data.</p>
<p>A method that changes the value needs access to the original, not a copy: a pointer receiver in Go,
<code>&amp;mut self</code> in Rust. Haskell has no methods: plain functions take the record as an
argument.</p>`,
    output: `area: 50
perim: 30
scaled area: 200
`,
    code: {
      python: `class Rect:
    def __init__(self, width, height):
        self.width = width
        self.height = height

    # self is the object the method is called on.
    def area(self):
        return self.width * self.height

    def perim(self):
        return 2 * self.width + 2 * self.height

    def scale(self, k):
        self.width *= k
        self.height *= k


r = Rect(10, 5)
print("area:", r.area())
print("perim:", r.perim())

r.scale(2)
print("scaled area:", r.area())
`,
      c: `#include <stdio.h>

/* C has no methods; by convention, functions take the struct first. */
struct rect {
    int width, height;
};

static int rect_area(const struct rect *r) { return r->width * r->height; }

static int rect_perim(const struct rect *r) { return 2 * r->width + 2 * r->height; }

static void rect_scale(struct rect *r, int k) {
    r->width *= k;
    r->height *= k;
}

int main(void) {
    struct rect r = {10, 5};
    printf("area: %d\\n", rect_area(&r));
    printf("perim: %d\\n", rect_perim(&r));

    rect_scale(&r, 2);
    printf("scaled area: %d\\n", rect_area(&r));
    return 0;
}
`,
      cpp: `#include <iostream>

class Rect {
public:
    Rect(int width, int height) : width_(width), height_(height) {}

    // const: this method promises not to change the object.
    int area() const { return width_ * height_; }
    int perim() const { return 2 * width_ + 2 * height_; }

    void scale(int k) {
        width_ *= k;
        height_ *= k;
    }

private:
    int width_, height_; // only Rect's methods can touch these
};

int main() {
    Rect r(10, 5);
    std::cout << "area: " << r.area() << "\\n";
    std::cout << "perim: " << r.perim() << "\\n";

    r.scale(2);
    std::cout << "scaled area: " << r.area() << "\\n";
}
`,
      go: `package main

import "fmt"

type rect struct {
	width, height int
}

// (r rect) is the receiver: area is a method on rect.
func (r rect) area() int {
	return r.width * r.height
}

func (r rect) perim() int {
	return 2*r.width + 2*r.height
}

// A pointer receiver can modify the original rect.
func (r *rect) scale(k int) {
	r.width *= k
	r.height *= k
}

func main() {
	r := rect{width: 10, height: 5}
	fmt.Println("area:", r.area())
	fmt.Println("perim:", r.perim())

	// Go takes &r automatically for pointer-receiver methods.
	r.scale(2)
	fmt.Println("scaled area:", r.area())
}
`,
      rust: `struct Rect {
    width: u32,
    height: u32,
}

// Methods live in an impl block.
impl Rect {
    // &self borrows the value read-only.
    fn area(&self) -> u32 {
        self.width * self.height
    }

    fn perim(&self) -> u32 {
        2 * self.width + 2 * self.height
    }

    // &mut self is needed to change fields.
    fn scale(&mut self, k: u32) {
        self.width *= k;
        self.height *= k;
    }
}

fn main() {
    let mut r = Rect { width: 10, height: 5 };
    println!("area: {}", r.area());
    println!("perim: {}", r.perim());

    r.scale(2);
    println!("scaled area: {}", r.area());
}
`,
      haskell: `data Rect = Rect {width :: Int, height :: Int}

-- Plain functions over Rect play the role of methods.
area :: Rect -> Int
area r = width r * height r

perim :: Rect -> Int
perim r = 2 * width r + 2 * height r

-- "Changing" a Rect returns a new one.
scale :: Int -> Rect -> Rect
scale k r = Rect (width r * k) (height r * k)

main :: IO ()
main = do
  let r = Rect 10 5
  putStrLn ("area: " ++ show (area r))
  putStrLn ("perim: " ++ show (perim r))
  putStrLn ("scaled area: " ++ show (area (scale 2 r)))
`,
      javascript: `class Rect {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }

  // this is the object the method was called on.
  area() {
    return this.width * this.height;
  }

  perim() {
    return 2 * this.width + 2 * this.height;
  }

  scale(k) {
    this.width *= k;
    this.height *= k;
  }
}

const r = new Rect(10, 5);
console.log("area:", r.area());
console.log("perim:", r.perim());

r.scale(2);
console.log("scaled area:", r.area());
`,
      typescript: `class Rect {
  // Parameter properties: declare and assign fields in one go.
  constructor(private width: number, private height: number) {}

  area(): number {
    return this.width * this.height;
  }

  perim(): number {
    return 2 * this.width + 2 * this.height;
  }

  scale(k: number): void {
    this.width *= k;
    this.height *= k;
  }
}

const r = new Rect(10, 5);
console.log("area:", r.area());
console.log("perim:", r.perim());

r.scale(2);
// r.width = 1; // error: 'width' is private
console.log("scaled area:", r.area());
`,
    },
  },

  {
    id: "interfaces",
    title: "Interfaces",
    intro: `<p>An <b>interface</b> names a set of methods. Code written against the interface works with
<i>any</i> type that provides them: here, anything with an <code>area</code>.</p>
<p>The idea goes by many names: interfaces (Go, TypeScript), traits (Rust), type classes (Haskell),
abstract base classes (C++, Python). C does it by hand with function pointers. JavaScript
just calls the method and trusts it's there (duck typing).</p>`,
    output: `rect area: 12.00
circle area: 78.54
total area: 90.54
`,
    code: {
      python: `import math
from abc import ABC, abstractmethod


# An abstract base class: subclasses must implement area.
class Shape(ABC):
    @abstractmethod
    def area(self): ...


class Rect(Shape):
    def __init__(self, w, h):
        self.w, self.h = w, h

    def area(self):
        return self.w * self.h


class Circle(Shape):
    def __init__(self, r):
        self.r = r

    def area(self):
        return math.pi * self.r**2


shapes = {"rect": Rect(3, 4), "circle": Circle(5)}
for label, shape in shapes.items():
    print(f"{label} area: {shape.area():.2f}")

# Works for any Shape, whatever its concrete type.
print(f"total area: {sum(s.area() for s in shapes.values()):.2f}")
`,
      c: `#include <math.h>
#include <stdio.h>

/* A hand-made interface: each shape carries a pointer to its area function. */
struct shape {
    const char *label;
    double (*area)(const struct shape *);
    double a, b;
};

static double rect_area(const struct shape *s) { return s->a * s->b; }

static double circle_area(const struct shape *s) { return M_PI * s->a * s->a; }

int main(void) {
    struct shape shapes[] = {
        {"rect", rect_area, 3, 4},
        {"circle", circle_area, 5, 0},
    };
    double total = 0;
    for (int i = 0; i < 2; i++) {
        double a = shapes[i].area(&shapes[i]);
        printf("%s area: %.2f\\n", shapes[i].label, a);
        total += a;
    }
    printf("total area: %.2f\\n", total);
    return 0;
}
`,
      cpp: `#include <cmath>
#include <cstdio>
#include <memory>
#include <vector>

// An abstract class: = 0 marks a method subclasses must override.
class Shape {
public:
    virtual ~Shape() = default;
    virtual const char *label() const = 0;
    virtual double area() const = 0;
};

class Rect : public Shape {
public:
    Rect(double w, double h) : w_(w), h_(h) {}
    const char *label() const override { return "rect"; }
    double area() const override { return w_ * h_; }

private:
    double w_, h_;
};

class Circle : public Shape {
public:
    explicit Circle(double r) : r_(r) {}
    const char *label() const override { return "circle"; }
    double area() const override { return M_PI * r_ * r_; }

private:
    double r_;
};

int main() {
    // Store shapes by pointer so each keeps its own concrete type.
    std::vector<std::unique_ptr<Shape>> shapes;
    shapes.push_back(std::make_unique<Rect>(3, 4));
    shapes.push_back(std::make_unique<Circle>(5));

    double total = 0;
    for (const auto &s : shapes) {
        std::printf("%s area: %.2f\\n", s->label(), s->area());
        total += s->area();
    }
    std::printf("total area: %.2f\\n", total);
}
`,
      go: `package main

import (
	"fmt"
	"math"
)

// Any type with these methods satisfies shape; no "implements" needed.
type shape interface {
	label() string
	area() float64
}

type rect struct{ w, h float64 }
type circle struct{ r float64 }

func (r rect) label() string   { return "rect" }
func (r rect) area() float64   { return r.w * r.h }
func (c circle) label() string { return "circle" }
func (c circle) area() float64 { return math.Pi * c.r * c.r }

func main() {
	shapes := []shape{rect{3, 4}, circle{5}}
	total := 0.0
	for _, s := range shapes {
		fmt.Printf("%s area: %.2f\\n", s.label(), s.area())
		total += s.area()
	}
	fmt.Printf("total area: %.2f\\n", total)
}
`,
      rust: `use std::f64::consts::PI;

// A trait declares behavior that types can implement.
trait Shape {
    fn label(&self) -> &str;
    fn area(&self) -> f64;
}

struct Rect {
    w: f64,
    h: f64,
}

struct Circle {
    r: f64,
}

impl Shape for Rect {
    fn label(&self) -> &str {
        "rect"
    }
    fn area(&self) -> f64 {
        self.w * self.h
    }
}

impl Shape for Circle {
    fn label(&self) -> &str {
        "circle"
    }
    fn area(&self) -> f64 {
        PI * self.r * self.r
    }
}

fn main() {
    // Box<dyn Shape> holds any type that implements Shape.
    let shapes: Vec<Box<dyn Shape>> = vec![
        Box::new(Rect { w: 3.0, h: 4.0 }),
        Box::new(Circle { r: 5.0 }),
    ];
    let mut total = 0.0;
    for s in &shapes {
        println!("{} area: {:.2}", s.label(), s.area());
        total += s.area();
    }
    println!("total area: {:.2}", total);
}
`,
      haskell: `import Text.Printf (printf)

-- A type class lists functions a type must provide.
class Shape a where
  label :: a -> String
  area :: a -> Double

data Rect = Rect Double Double

data Circle = Circle Double

instance Shape Rect where
  label _ = "rect"
  area (Rect w h) = w * h

instance Shape Circle where
  label _ = "circle"
  area (Circle r) = pi * r * r

-- Works for any type with a Shape instance.
report :: Shape a => a -> IO ()
report s = printf "%s area: %.2f\\n" (label s) (area s)

main :: IO ()
main = do
  let r = Rect 3 4
      c = Circle 5
  report r
  report c
  printf "total area: %.2f\\n" (area r + area c)
`,
      javascript: `// No interface keyword: any object with label() and area() will do.
class Rect {
  constructor(w, h) {
    this.w = w;
    this.h = h;
  }
  label() { return "rect"; }
  area() { return this.w * this.h; }
}

class Circle {
  constructor(r) {
    this.r = r;
  }
  label() { return "circle"; }
  area() { return Math.PI * this.r ** 2; }
}

const shapes = [new Rect(3, 4), new Circle(5)];
let total = 0;
for (const s of shapes) {
  console.log(\`\${s.label()} area: \${s.area().toFixed(2)}\`);
  total += s.area();
}
console.log(\`total area: \${total.toFixed(2)}\`);
`,
      typescript: `interface Shape {
  label(): string;
  area(): number;
}

// implements makes tsc check that the class fits the interface.
class Rect implements Shape {
  constructor(private w: number, private h: number) {}
  label(): string { return "rect"; }
  area(): number { return this.w * this.h; }
}

class Circle implements Shape {
  constructor(private r: number) {}
  label(): string { return "circle"; }
  area(): number { return Math.PI * this.r ** 2; }
}

const shapes: Shape[] = [new Rect(3, 4), new Circle(5)];
let total = 0;
for (const s of shapes) {
  console.log(\`\${s.label()} area: \${s.area().toFixed(2)}\`);
  total += s.area();
}
console.log(\`total area: \${total.toFixed(2)}\`);
`,
    },
  },

  {
    id: "errors",
    title: "Errors",
    intro: `<p>Things go wrong: files are missing, input is invalid, someone divides by zero. Languages report
failure in two main styles:</p>
<ul>
<li><b>Exceptions</b> (Python, C++, JavaScript, TypeScript): <code>throw</code> jumps out of the function until a
<code>catch</code> handles it.</li>
<li><b>Error values</b> (C, Go, Rust, Haskell): the function returns either a result or an error, and the caller
must check which one it got.</li>
</ul>`,
    output: `f(1) = 4
error: can't work with 42
10 / 2 = 5
error: division by zero
`,
    code: {
      python: `def f(arg):
    if arg == 42:
        raise ValueError("can't work with 42")
    return arg + 3


for arg in (1, 42):
    try:
        print(f"f({arg}) = {f(arg)}")
    except ValueError as e:
        print("error:", e)

# Built-in operations raise exceptions too.
for d in (2, 0):
    try:
        print(f"10 / {d} = {10 // d}")
    except ZeroDivisionError:
        print("error: division by zero")
`,
      c: `#include <stdio.h>

/* A common C convention: return 0 on success or an error code, and write
   the result through a pointer. */
enum { OK = 0, ERR_42, ERR_DIV_ZERO };

static const char *error_message(int err) {
    switch (err) {
    case ERR_42: return "can't work with 42";
    case ERR_DIV_ZERO: return "division by zero";
    default: return "unknown error";
    }
}

static int f(int arg, int *out) {
    if (arg == 42) return ERR_42;
    *out = arg + 3;
    return OK;
}

static int divide(int a, int b, int *out) {
    if (b == 0) return ERR_DIV_ZERO; /* dividing by 0 would crash */
    *out = a / b;
    return OK;
}

int main(void) {
    int args[] = {1, 42};
    for (int i = 0; i < 2; i++) {
        int result;
        int err = f(args[i], &result);
        if (err) printf("error: %s\\n", error_message(err));
        else printf("f(%d) = %d\\n", args[i], result);
    }

    int divisors[] = {2, 0};
    for (int i = 0; i < 2; i++) {
        int result;
        int err = divide(10, divisors[i], &result);
        if (err) printf("error: %s\\n", error_message(err));
        else printf("10 / %d = %d\\n", divisors[i], result);
    }
    return 0;
}
`,
      cpp: `#include <iostream>
#include <stdexcept>

int f(int arg) {
    if (arg == 42) throw std::invalid_argument("can't work with 42");
    return arg + 3;
}

int divide(int a, int b) {
    // Integer division by zero is undefined behavior in C++, not an exception.
    if (b == 0) throw std::domain_error("division by zero");
    return a / b;
}

int main() {
    for (int arg : {1, 42}) {
        try {
            // Compute first: if f throws, nothing has been printed yet.
            int r = f(arg);
            std::cout << "f(" << arg << ") = " << r << "\\n";
        } catch (const std::exception &e) {
            std::cout << "error: " << e.what() << "\\n";
        }
    }

    for (int d : {2, 0}) {
        try {
            int q = divide(10, d);
            std::cout << "10 / " << d << " = " << q << "\\n";
        } catch (const std::exception &e) {
            std::cout << "error: " << e.what() << "\\n";
        }
    }
}
`,
      go: `package main

import (
	"errors"
	"fmt"
)

// By convention the error is the last return value; nil means success.
func f(arg int) (int, error) {
	if arg == 42 {
		return 0, errors.New("can't work with 42")
	}
	return arg + 3, nil
}

// A sentinel error callers can compare against with errors.Is.
var ErrDivZero = errors.New("division by zero")

func divide(a, b int) (int, error) {
	if b == 0 {
		return 0, ErrDivZero
	}
	return a / b, nil
}

func main() {
	for _, arg := range []int{1, 42} {
		if r, err := f(arg); err != nil {
			fmt.Println("error:", err)
		} else {
			fmt.Printf("f(%d) = %d\\n", arg, r)
		}
	}

	for _, d := range []int{2, 0} {
		q, err := divide(10, d)
		if errors.Is(err, ErrDivZero) {
			fmt.Println("error:", err)
			continue
		}
		fmt.Printf("10 / %d = %d\\n", d, q)
	}
}
`,
      rust: `// Result<T, E> is either Ok(value) or Err(error).
fn f(arg: i32) -> Result<i32, String> {
    if arg == 42 {
        return Err(String::from("can't work with 42"));
    }
    Ok(arg + 3)
}

// checked_div returns None instead of panicking on division by zero.
fn divide(a: i32, b: i32) -> Result<i32, String> {
    a.checked_div(b).ok_or(String::from("division by zero"))
}

fn main() {
    for arg in [1, 42].iter() {
        // match forces you to handle both cases.
        match f(*arg) {
            Ok(r) => println!("f({}) = {}", arg, r),
            Err(e) => println!("error: {}", e),
        }
    }

    for d in [2, 0].iter() {
        match divide(10, *d) {
            Ok(q) => println!("10 / {} = {}", d, q),
            Err(e) => println!("error: {}", e),
        }
    }
}
`,
      haskell: `-- Either String Int is Left an error message, or Right a result.
f :: Int -> Either String Int
f 42 = Left "can't work with 42"
f arg = Right (arg + 3)

divide :: Int -> Int -> Either String Int
divide _ 0 = Left "division by zero"
divide a b = Right (a \`div\` b)

main :: IO ()
main = do
  mapM_
    ( \\arg -> putStrLn $ case f arg of
        Right r -> "f(" ++ show arg ++ ") = " ++ show r
        Left e -> "error: " ++ e
    )
    [1, 42]

  -- either applies the first function to a Left, the second to a Right.
  mapM_
    (\\d -> putStrLn (either ("error: " ++) (\\q -> "10 / " ++ show d ++ " = " ++ show q) (divide 10 d)))
    [2, 0]
`,
      javascript: `function f(arg) {
  if (arg === 42) throw new Error("can't work with 42");
  return arg + 3;
}

// JavaScript division never throws: 10 / 0 is Infinity. Check yourself.
function divide(a, b) {
  if (b === 0) throw new RangeError("division by zero");
  return Math.trunc(a / b);
}

for (const arg of [1, 42]) {
  try {
    console.log(\`f(\${arg}) = \${f(arg)}\`);
  } catch (e) {
    console.log("error:", e.message);
  }
}

for (const d of [2, 0]) {
  try {
    console.log(\`10 / \${d} = \${divide(10, d)}\`);
  } catch (e) {
    console.log("error:", e.message);
  }
}
`,
      typescript: `function f(arg: number): number {
  if (arg === 42) throw new Error("can't work with 42");
  return arg + 3;
}

function divide(a: number, b: number): number {
  if (b === 0) throw new RangeError("division by zero");
  return Math.trunc(a / b);
}

// Anything can be thrown, so a caught value has type unknown: check it.
function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

for (const arg of [1, 42]) {
  try {
    console.log(\`f(\${arg}) = \${f(arg)}\`);
  } catch (e) {
    console.log("error:", message(e));
  }
}

for (const d of [2, 0]) {
  try {
    console.log(\`10 / \${d} = \${divide(10, d)}\`);
  } catch (e) {
    console.log("error:", message(e));
  }
}
`,
    },
  },

  {
    id: "sorting",
    title: "Sorting",
    intro: `<p>Every standard library can sort. For anything beyond the natural order, you pass a
<b>key</b> function (what to sort by) or a <b>comparator</b> (which of two items comes first).</p>
<p>A classic trap: JavaScript's <code>sort()</code> without a comparator sorts <i>as strings</i>, so
<code>[10, 9, 1].sort()</code> gives <code>[1, 10, 9]</code>.</p>`,
    output: `strings: a b c
ints: 2 4 7
by length: kiwi peach banana
descending: 7 4 2
`,
    code: {
      python: `strs = ["c", "a", "b"]
# sort() sorts in place; sorted() returns a new list.
strs.sort()
print("strings:", *strs)

ints = [7, 2, 4]
print("ints:", *sorted(ints))

fruits = ["peach", "banana", "kiwi"]
# key computes the value to compare.
print("by length:", *sorted(fruits, key=len))

print("descending:", *sorted(ints, reverse=True))
`,
      c: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* qsort calls a comparator with pointers to two elements. It returns
   <0 if a comes first, >0 if b comes first, 0 if they're equal. */
static int cmp_str(const void *a, const void *b) {
    return strcmp(*(const char *const *)a, *(const char *const *)b);
}

static int cmp_int(const void *a, const void *b) {
    int x = *(const int *)a, y = *(const int *)b;
    return (x > y) - (x < y); /* avoids overflow of x - y */
}

static int cmp_len(const void *a, const void *b) {
    size_t x = strlen(*(const char *const *)a), y = strlen(*(const char *const *)b);
    return (x > y) - (x < y);
}

static int cmp_int_desc(const void *a, const void *b) { return cmp_int(b, a); }

static void show_strs(const char *label, const char **s, int n) {
    printf("%s", label);
    for (int i = 0; i < n; i++) printf(" %s", s[i]);
    printf("\\n");
}

static void show_ints(const char *label, const int *v, int n) {
    printf("%s", label);
    for (int i = 0; i < n; i++) printf(" %d", v[i]);
    printf("\\n");
}

int main(void) {
    const char *strs[] = {"c", "a", "b"};
    qsort(strs, 3, sizeof strs[0], cmp_str);
    show_strs("strings:", strs, 3);

    int ints[] = {7, 2, 4};
    qsort(ints, 3, sizeof ints[0], cmp_int);
    show_ints("ints:", ints, 3);

    const char *fruits[] = {"peach", "banana", "kiwi"};
    qsort(fruits, 3, sizeof fruits[0], cmp_len);
    show_strs("by length:", fruits, 3);

    qsort(ints, 3, sizeof ints[0], cmp_int_desc);
    show_ints("descending:", ints, 3);
    return 0;
}
`,
      cpp: `#include <algorithm>
#include <functional>
#include <iostream>
#include <string>
#include <vector>

template <typename T>
void show(const std::string &label, const std::vector<T> &v) {
    std::cout << label;
    for (const auto &x : v) std::cout << " " << x;
    std::cout << "\\n";
}

int main() {
    std::vector<std::string> strs = {"c", "a", "b"};
    std::sort(strs.begin(), strs.end());
    show("strings:", strs);

    std::vector<int> ints = {7, 2, 4};
    std::sort(ints.begin(), ints.end());
    show("ints:", ints);

    // A comparator returns true if a should come before b.
    std::vector<std::string> fruits = {"peach", "banana", "kiwi"};
    std::sort(fruits.begin(), fruits.end(),
              [](const std::string &a, const std::string &b) { return a.size() < b.size(); });
    show("by length:", fruits);

    std::sort(ints.begin(), ints.end(), std::greater<int>());
    show("descending:", ints);
}
`,
      go: `package main

import (
	"fmt"
	"sort"
	"strings"
)

func main() {
	strs := []string{"c", "a", "b"}
	sort.Strings(strs) // sorts in place
	fmt.Println("strings:", strings.Join(strs, " "))

	ints := []int{7, 2, 4}
	sort.Ints(ints)
	fmt.Println("ints:", strings.Trim(fmt.Sprint(ints), "[]"))

	// sort.Slice takes a "less" function over two indexes.
	fruits := []string{"peach", "banana", "kiwi"}
	sort.Slice(fruits, func(i, j int) bool {
		return len(fruits[i]) < len(fruits[j])
	})
	fmt.Println("by length:", strings.Join(fruits, " "))

	sort.Sort(sort.Reverse(sort.IntSlice(ints)))
	fmt.Println("descending:", strings.Trim(fmt.Sprint(ints), "[]"))
}
`,
      rust: `fn join<T: ToString>(v: &[T]) -> String {
    v.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(" ")
}

fn main() {
    let mut strs = vec!["c", "a", "b"];
    strs.sort(); // sorts in place
    println!("strings: {}", join(&strs));

    let mut ints = vec![7, 2, 4];
    ints.sort();
    println!("ints: {}", join(&ints));

    // sort_by_key sorts by a computed key.
    let mut fruits = vec!["peach", "banana", "kiwi"];
    fruits.sort_by_key(|f| f.len());
    println!("by length: {}", join(&fruits));

    // sort_by takes a comparator; swapping a and b reverses the order.
    ints.sort_by(|a, b| b.cmp(a));
    println!("descending: {}", join(&ints));
}
`,
      haskell: `import Data.List (sort, sortBy, sortOn)
import Data.Ord (Down (..), comparing)

-- sort never changes its input (nothing does): it returns a new list.
main :: IO ()
main = do
  putStrLn ("strings: " ++ unwords (sort ["c", "a", "b"]))

  let ints = [7, 2, 4] :: [Int]
  putStrLn ("ints: " ++ unwords (map show (sort ints)))

  -- sortOn sorts by a key function.
  putStrLn ("by length: " ++ unwords (sortOn length ["peach", "banana", "kiwi"]))

  -- comparing Down flips the order.
  putStrLn ("descending: " ++ unwords (map show (sortBy (comparing Down) ints)))
`,
      javascript: `const strs = ["c", "a", "b"];
strs.sort(); // sorts in place
console.log("strings:", strs.join(" "));

// A comparator returns <0, 0 or >0. Without one, numbers sort as strings!
const ints = [7, 2, 4];
ints.sort((a, b) => a - b);
console.log("ints:", ints.join(" "));

const fruits = ["peach", "banana", "kiwi"];
fruits.sort((a, b) => a.length - b.length);
console.log("by length:", fruits.join(" "));

ints.sort((a, b) => b - a);
console.log("descending:", ints.join(" "));
`,
      typescript: `const strs: string[] = ["c", "a", "b"];
strs.sort();
console.log("strings:", strs.join(" "));

const ints: number[] = [7, 2, 4];
ints.sort((a, b) => a - b);
console.log("ints:", ints.join(" "));

const fruits: string[] = ["peach", "banana", "kiwi"];
fruits.sort((a, b) => a.length - b.length);
console.log("by length:", fruits.join(" "));

ints.sort((a, b) => b - a);
console.log("descending:", ints.join(" "));
`,
    },
  },
];
