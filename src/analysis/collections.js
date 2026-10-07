// Robo Rally Course Randomizer - small data structures used by route search
export class MinHeap {
  constructor(score) {
    this.items = [];
    this.score = score;
  }

  get size() {
    return this.items.length;
  }

  push(value) {
    const items = this.items;
    let index = items.length;
    items.push(value);

    while (index > 0) {
      const parent = (index - 1) >> 1;
      const parentValue = items[parent];
      if (this.score(parentValue) <= this.score(value)) {
        break;
      }
      items[index] = parentValue;
      index = parent;
    }

    items[index] = value;
  }

  pop() {
    const items = this.items;
    if (!items.length) {
      return null;
    }

    const root = items[0];
    const last = items.pop();
    if (!items.length) {
      return root;
    }

    let index = 0;
    while (true) {
      let child = index * 2 + 1;
      if (child >= items.length) {
        break;
      }

      if (child + 1 < items.length && this.score(items[child + 1]) < this.score(items[child])) {
        child += 1;
      }

      if (this.score(last) <= this.score(items[child])) {
        break;
      }

      items[index] = items[child];
      index = child;
    }

    items[index] = last;
    return root;
  }
}
