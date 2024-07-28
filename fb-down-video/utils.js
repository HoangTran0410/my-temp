// https://stackoverflow.com/a/125106/23648002
export function elementInViewport(el) {
  var top = el.offsetTop;
  var left = el.offsetLeft;
  var width = el.offsetWidth;
  var height = el.offsetHeight;

  while (el.offsetParent) {
    el = el.offsetParent;
    top += el.offsetTop;
    left += el.offsetLeft;
  }

  return (
    top >= window.pageYOffset &&
    left >= window.pageXOffset &&
    top + height <= window.pageYOffset + window.innerHeight &&
    left + width <= window.pageXOffset + window.innerWidth
  );
}

// modified based on: https://gist.github.com/jcouyang/632709f30e12a7879a73e9e132c0d56b
export function promiseAllStepN(n, list) {
  const head = list.slice(0, n);
  const tail = list.slice(n);
  const resolved = [];
  let stop = false;

  return {
    start: () =>
      new Promise((resolve) => {
        let processed = 0;
        function runNext() {
          if (processed === tail.length || stop) {
            resolve(Promise.all(resolved));
            return;
          }
          const promise = tail[processed](processed);
          resolved.push(
            promise.then((result) => {
              runNext();
              return result;
            })
          );
          processed++;
        }
        head.forEach((func) => {
          const promise = func(processed);
          resolved.push(
            promise.then((result) => {
              runNext();
              return result;
            })
          );
        });
      }),
    stop: () => {
      stop = true;
    },
  };
}
