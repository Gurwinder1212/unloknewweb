// Content Tree - Home - Updated June 3, 2024
function noop() { }
const identity = x => x;
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
let src_url_equal_anchor;
function src_url_equal(element_src, url) {
    if (!src_url_equal_anchor) {
        src_url_equal_anchor = document.createElement('a');
    }
    src_url_equal_anchor.href = url;
    return element_src === src_url_equal_anchor.href;
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}

const is_client = typeof window !== 'undefined';
let now = is_client
    ? () => window.performance.now()
    : () => Date.now();
let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

const tasks = new Set();
function run_tasks(now) {
    tasks.forEach(task => {
        if (!task.c(now)) {
            tasks.delete(task);
            task.f();
        }
    });
    if (tasks.size !== 0)
        raf(run_tasks);
}
/**
 * Creates a new task that runs on each raf frame
 * until it returns a falsy value or is aborted
 */
function loop(callback) {
    let task;
    if (tasks.size === 0)
        raf(run_tasks);
    return {
        promise: new Promise(fulfill => {
            tasks.add(task = { c: callback, f: fulfill });
        }),
        abort() {
            tasks.delete(task);
        }
    };
}

// Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
// at the end of hydration without touching the remaining nodes.
let is_hydrating = false;
function start_hydrating() {
    is_hydrating = true;
}
function end_hydrating() {
    is_hydrating = false;
}
function upper_bound(low, high, key, value) {
    // Return first index of value larger than input value in the range [low, high)
    while (low < high) {
        const mid = low + ((high - low) >> 1);
        if (key(mid) <= value) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return low;
}
function init_hydrate(target) {
    if (target.hydrate_init)
        return;
    target.hydrate_init = true;
    // We know that all children have claim_order values since the unclaimed have been detached if target is not <head>
    let children = target.childNodes;
    // If target is <head>, there may be children without claim_order
    if (target.nodeName === 'HEAD') {
        const myChildren = [];
        for (let i = 0; i < children.length; i++) {
            const node = children[i];
            if (node.claim_order !== undefined) {
                myChildren.push(node);
            }
        }
        children = myChildren;
    }
    /*
    * Reorder claimed children optimally.
    * We can reorder claimed children optimally by finding the longest subsequence of
    * nodes that are already claimed in order and only moving the rest. The longest
    * subsequence of nodes that are claimed in order can be found by
    * computing the longest increasing subsequence of .claim_order values.
    *
    * This algorithm is optimal in generating the least amount of reorder operations
    * possible.
    *
    * Proof:
    * We know that, given a set of reordering operations, the nodes that do not move
    * always form an increasing subsequence, since they do not move among each other
    * meaning that they must be already ordered among each other. Thus, the maximal
    * set of nodes that do not move form a longest increasing subsequence.
    */
    // Compute longest increasing subsequence
    // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
    const m = new Int32Array(children.length + 1);
    // Predecessor indices + 1
    const p = new Int32Array(children.length);
    m[0] = -1;
    let longest = 0;
    for (let i = 0; i < children.length; i++) {
        const current = children[i].claim_order;
        // Find the largest subsequence length such that it ends in a value less than our current value
        // upper_bound returns first greater value, so we subtract one
        // with fast path for when we are on the current longest subsequence
        const seqLen = ((longest > 0 && children[m[longest]].claim_order <= current) ? longest + 1 : upper_bound(1, longest, idx => children[m[idx]].claim_order, current)) - 1;
        p[i] = m[seqLen] + 1;
        const newLen = seqLen + 1;
        // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
        m[newLen] = i;
        longest = Math.max(newLen, longest);
    }
    // The longest increasing subsequence of nodes (initially reversed)
    const lis = [];
    // The rest of the nodes, nodes that will be moved
    const toMove = [];
    let last = children.length - 1;
    for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
        lis.push(children[cur - 1]);
        for (; last >= cur; last--) {
            toMove.push(children[last]);
        }
        last--;
    }
    for (; last >= 0; last--) {
        toMove.push(children[last]);
    }
    lis.reverse();
    // We sort the nodes being moved to guarantee that their insertion order matches the claim order
    toMove.sort((a, b) => a.claim_order - b.claim_order);
    // Finally, we move the nodes
    for (let i = 0, j = 0; i < toMove.length; i++) {
        while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
            j++;
        }
        const anchor = j < lis.length ? lis[j] : null;
        target.insertBefore(toMove[i], anchor);
    }
}
function append(target, node) {
    target.appendChild(node);
}
function get_root_for_style(node) {
    if (!node)
        return document;
    const root = node.getRootNode ? node.getRootNode() : node.ownerDocument;
    if (root && root.host) {
        return root;
    }
    return node.ownerDocument;
}
function append_empty_stylesheet(node) {
    const style_element = element('style');
    append_stylesheet(get_root_for_style(node), style_element);
    return style_element.sheet;
}
function append_stylesheet(node, style) {
    append(node.head || node, style);
    return style.sheet;
}
function append_hydration(target, node) {
    if (is_hydrating) {
        init_hydrate(target);
        if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentNode !== target))) {
            target.actual_end_child = target.firstChild;
        }
        // Skip nodes of undefined ordering
        while ((target.actual_end_child !== null) && (target.actual_end_child.claim_order === undefined)) {
            target.actual_end_child = target.actual_end_child.nextSibling;
        }
        if (node !== target.actual_end_child) {
            // We only insert if the ordering of this node should be modified or the parent node is not target
            if (node.claim_order !== undefined || node.parentNode !== target) {
                target.insertBefore(node, target.actual_end_child);
            }
        }
        else {
            target.actual_end_child = node.nextSibling;
        }
    }
    else if (node.parentNode !== target || node.nextSibling !== null) {
        target.appendChild(node);
    }
}
function insert_hydration(target, node, anchor) {
    if (is_hydrating && !anchor) {
        append_hydration(target, node);
    }
    else if (node.parentNode !== target || node.nextSibling != anchor) {
        target.insertBefore(node, anchor || null);
    }
}
function detach(node) {
    if (node.parentNode) {
        node.parentNode.removeChild(node);
    }
}
function element(name) {
    return document.createElement(name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function children(element) {
    return Array.from(element.childNodes);
}
function init_claim_info(nodes) {
    if (nodes.claim_info === undefined) {
        nodes.claim_info = { last_index: 0, total_claimed: 0 };
    }
}
function claim_node(nodes, predicate, processNode, createNode, dontUpdateLastIndex = false) {
    // Try to find nodes in an order such that we lengthen the longest increasing subsequence
    init_claim_info(nodes);
    const resultNode = (() => {
        // We first try to find an element after the previous one
        for (let i = nodes.claim_info.last_index; i < nodes.length; i++) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                return node;
            }
        }
        // Otherwise, we try to find one before
        // We iterate in reverse so that we don't go too far back
        for (let i = nodes.claim_info.last_index - 1; i >= 0; i--) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                else if (replacement === undefined) {
                    // Since we spliced before the last_index, we decrease it
                    nodes.claim_info.last_index--;
                }
                return node;
            }
        }
        // If we can't find any matching node, we create a new one
        return createNode();
    })();
    resultNode.claim_order = nodes.claim_info.total_claimed;
    nodes.claim_info.total_claimed += 1;
    return resultNode;
}
function claim_element_base(nodes, name, attributes, create_element) {
    return claim_node(nodes, (node) => node.nodeName === name, (node) => {
        const remove = [];
        for (let j = 0; j < node.attributes.length; j++) {
            const attribute = node.attributes[j];
            if (!attributes[attribute.name]) {
                remove.push(attribute.name);
            }
        }
        remove.forEach(v => node.removeAttribute(v));
        return undefined;
    }, () => create_element(name));
}
function claim_element(nodes, name, attributes) {
    return claim_element_base(nodes, name, attributes, element);
}
function claim_text(nodes, data) {
    return claim_node(nodes, (node) => node.nodeType === 3, (node) => {
        const dataStr = '' + data;
        if (node.data.startsWith(dataStr)) {
            if (node.data.length !== dataStr.length) {
                return node.splitText(dataStr.length);
            }
        }
        else {
            node.data = dataStr;
        }
    }, () => text(data), true // Text nodes should not update last index since it is likely not worth it to eliminate an increasing subsequence of actual elements
    );
}
function claim_space(nodes) {
    return claim_text(nodes, ' ');
}
function set_data(text, data) {
    data = '' + data;
    if (text.data === data)
        return;
    text.data = data;
}
function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
    const e = document.createEvent('CustomEvent');
    e.initCustomEvent(type, bubbles, cancelable, detail);
    return e;
}

// we need to store the information for multiple documents because a Svelte application could also contain iframes
// https://github.com/sveltejs/svelte/issues/3624
const managed_styles = new Map();
let active = 0;
// https://github.com/darkskyapp/string-hash/blob/master/index.js
function hash(str) {
    let hash = 5381;
    let i = str.length;
    while (i--)
        hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
    return hash >>> 0;
}
function create_style_information(doc, node) {
    const info = { stylesheet: append_empty_stylesheet(node), rules: {} };
    managed_styles.set(doc, info);
    return info;
}
function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
    const step = 16.666 / duration;
    let keyframes = '{\n';
    for (let p = 0; p <= 1; p += step) {
        const t = a + (b - a) * ease(p);
        keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
    }
    const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
    const name = `__svelte_${hash(rule)}_${uid}`;
    const doc = get_root_for_style(node);
    const { stylesheet, rules } = managed_styles.get(doc) || create_style_information(doc, node);
    if (!rules[name]) {
        rules[name] = true;
        stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
    }
    const animation = node.style.animation || '';
    node.style.animation = `${animation ? `${animation}, ` : ''}${name} ${duration}ms linear ${delay}ms 1 both`;
    active += 1;
    return name;
}
function delete_rule(node, name) {
    const previous = (node.style.animation || '').split(', ');
    const next = previous.filter(name
        ? anim => anim.indexOf(name) < 0 // remove specific animation
        : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
    );
    const deleted = previous.length - next.length;
    if (deleted) {
        node.style.animation = next.join(', ');
        active -= deleted;
        if (!active)
            clear_rules();
    }
}
function clear_rules() {
    raf(() => {
        if (active)
            return;
        managed_styles.forEach(info => {
            const { ownerNode } = info.stylesheet;
            // there is no ownerNode if it runs on jsdom.
            if (ownerNode)
                detach(ownerNode);
        });
        managed_styles.clear();
    });
}

let current_component;
function set_current_component(component) {
    current_component = component;
}

const dirty_components = [];
const binding_callbacks = [];
let render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = /* @__PURE__ */ Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
// flush() calls callbacks in this order:
// 1. All beforeUpdate callbacks, in order: parents before children
// 2. All bind:this callbacks, in reverse order: children before parents.
// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
//    for afterUpdates called during the initial onMount, which are called in
//    reverse order: children before parents.
// Since callbacks might update component values, which could trigger another
// call to flush(), the following steps guard against this:
// 1. During beforeUpdate, any updated components will be added to the
//    dirty_components array and will cause a reentrant call to flush(). Because
//    the flush index is kept outside the function, the reentrant call will pick
//    up where the earlier call left off and go through all dirty components. The
//    current_component value is saved and restored so that the reentrant call will
//    not interfere with the "parent" flush() call.
// 2. bind:this callbacks cannot trigger new flush() calls.
// 3. During afterUpdate, any updated components will NOT have their afterUpdate
//    callback called a second time; the seen_callbacks set, outside the flush()
//    function, guarantees this behavior.
const seen_callbacks = new Set();
let flushidx = 0; // Do *not* move this inside the flush() function
function flush() {
    // Do not reenter flush while dirty components are updated, as this can
    // result in an infinite loop. Instead, let the inner flush handle it.
    // Reentrancy is ok afterwards for bindings etc.
    if (flushidx !== 0) {
        return;
    }
    const saved_component = current_component;
    do {
        // first, call beforeUpdate functions
        // and update components
        try {
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
        }
        catch (e) {
            // reset dirty state to not end up in a deadlocked state and then rethrow
            dirty_components.length = 0;
            flushidx = 0;
            throw e;
        }
        set_current_component(null);
        dirty_components.length = 0;
        flushidx = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    seen_callbacks.clear();
    set_current_component(saved_component);
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
/**
 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
 */
function flush_render_callbacks(fns) {
    const filtered = [];
    const targets = [];
    render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
    targets.forEach((c) => c());
    render_callbacks = filtered;
}

let promise;
function wait() {
    if (!promise) {
        promise = Promise.resolve();
        promise.then(() => {
            promise = null;
        });
    }
    return promise;
}
function dispatch(node, direction, kind) {
    node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
}
const outroing = new Set();
let outros;
function group_outros() {
    outros = {
        r: 0,
        c: [],
        p: outros // parent group
    };
}
function check_outros() {
    if (!outros.r) {
        run_all(outros.c);
    }
    outros = outros.p;
}
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function transition_out(block, local, detach, callback) {
    if (block && block.o) {
        if (outroing.has(block))
            return;
        outroing.add(block);
        outros.c.push(() => {
            outroing.delete(block);
            if (callback) {
                if (detach)
                    block.d(1);
                callback();
            }
        });
        block.o(local);
    }
    else if (callback) {
        callback();
    }
}
const null_transition = { duration: 0 };
function create_bidirectional_transition(node, fn, params, intro) {
    const options = { direction: 'both' };
    let config = fn(node, params, options);
    let t = intro ? 0 : 1;
    let running_program = null;
    let pending_program = null;
    let animation_name = null;
    function clear_animation() {
        if (animation_name)
            delete_rule(node, animation_name);
    }
    function init(program, duration) {
        const d = (program.b - t);
        duration *= Math.abs(d);
        return {
            a: t,
            b: program.b,
            d,
            duration,
            start: program.start,
            end: program.start + duration,
            group: program.group
        };
    }
    function go(b) {
        const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
        const program = {
            start: now() + delay,
            b
        };
        if (!b) {
            // @ts-ignore todo: improve typings
            program.group = outros;
            outros.r += 1;
        }
        if (running_program || pending_program) {
            pending_program = program;
        }
        else {
            // if this is an intro, and there's a delay, we need to do
            // an initial tick and/or apply CSS animation immediately
            if (css) {
                clear_animation();
                animation_name = create_rule(node, t, b, duration, delay, easing, css);
            }
            if (b)
                tick(0, 1);
            running_program = init(program, duration);
            add_render_callback(() => dispatch(node, b, 'start'));
            loop(now => {
                if (pending_program && now > pending_program.start) {
                    running_program = init(pending_program, duration);
                    pending_program = null;
                    dispatch(node, running_program.b, 'start');
                    if (css) {
                        clear_animation();
                        animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                    }
                }
                if (running_program) {
                    if (now >= running_program.end) {
                        tick(t = running_program.b, 1 - t);
                        dispatch(node, running_program.b, 'end');
                        if (!pending_program) {
                            // we're done
                            if (running_program.b) {
                                // intro — we can tidy up immediately
                                clear_animation();
                            }
                            else {
                                // outro — needs to be coordinated
                                if (!--running_program.group.r)
                                    run_all(running_program.group.c);
                            }
                        }
                        running_program = null;
                    }
                    else if (now >= running_program.start) {
                        const p = now - running_program.start;
                        t = running_program.a + running_program.d * easing(p / running_program.duration);
                        tick(t, 1 - t);
                    }
                }
                return !!(running_program || pending_program);
            });
        }
    }
    return {
        run(b) {
            if (is_function(config)) {
                wait().then(() => {
                    // @ts-ignore
                    config = config(options);
                    go(b);
                });
            }
            else {
                go(b);
            }
        },
        end() {
            clear_animation();
            running_program = pending_program = null;
        }
    };
}
function mount_component(component, target, anchor, customElement) {
    const { fragment, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
            // if the component was destroyed immediately
            // it will update the `$$.on_destroy` reference to `null`.
            // the destructured on_destroy may still reference to the old array
            if (component.$$.on_destroy) {
                component.$$.on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
    }
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        flush_render_callbacks($$.after_update);
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
        fragment: null,
        ctx: [],
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        on_disconnect: [],
        before_update: [],
        after_update: [],
        context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false,
        root: options.target || parent_component.$$.root
    };
    append_styles && append_styles($$.root);
    let ready = false;
    $$.ctx = instance
        ? instance(component, options.props || {}, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            start_hydrating();
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor, options.customElement);
        end_hydrating();
        flush();
    }
    set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        if (!is_function(callback)) {
            return noop;
        }
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set($$props) {
        if (this.$$set && !is_empty($$props)) {
            this.$$.skip_bound = true;
            this.$$set($$props);
            this.$$.skip_bound = false;
        }
    }
}

function fade(node, { delay = 0, duration = 400, easing = identity } = {}) {
    const o = +getComputedStyle(node).opacity;
    return {
        delay,
        duration,
        easing,
        css: t => `opacity: ${t * o}`
    };
}

/* generated by Svelte v3.59.1 */

function create_if_block_1(ctx) {
	let div;
	let h60;
	let t0_value = /*team_member_4*/ ctx[5].name + "";
	let t0;
	let t1;
	let h61;
	let t2_value = /*team_member_4*/ ctx[5].title + "";
	let t2;
	let t3;
	let p0;
	let t4_value = /*team_member_4*/ ctx[5].description + "";
	let t4;
	let t5;
	let h62;
	let t6_value = /*team_member_5*/ ctx[6].name + "";
	let t6;
	let t7;
	let h63;
	let t8_value = /*team_member_5*/ ctx[6].title + "";
	let t8;
	let t9;
	let p1;
	let t10_value = /*team_member_5*/ ctx[6].description + "";
	let t10;
	let t11;
	let h64;
	let t12_value = /*team_member_6*/ ctx[7].name + "";
	let t12;
	let t13;
	let h65;
	let t14_value = /*team_member_6*/ ctx[7].title + "";
	let t14;
	let t15;
	let p2;
	let t16_value = /*team_member_6*/ ctx[7].description + "";
	let t16;
	let div_transition;
	let current;

	return {
		c() {
			div = element("div");
			h60 = element("h6");
			t0 = text(t0_value);
			t1 = space();
			h61 = element("h6");
			t2 = text(t2_value);
			t3 = space();
			p0 = element("p");
			t4 = text(t4_value);
			t5 = space();
			h62 = element("h6");
			t6 = text(t6_value);
			t7 = space();
			h63 = element("h6");
			t8 = text(t8_value);
			t9 = space();
			p1 = element("p");
			t10 = text(t10_value);
			t11 = space();
			h64 = element("h6");
			t12 = text(t12_value);
			t13 = space();
			h65 = element("h6");
			t14 = text(t14_value);
			t15 = space();
			p2 = element("p");
			t16 = text(t16_value);
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			h60 = claim_element(div_nodes, "H6", { class: true });
			var h60_nodes = children(h60);
			t0 = claim_text(h60_nodes, t0_value);
			h60_nodes.forEach(detach);
			t1 = claim_space(div_nodes);
			h61 = claim_element(div_nodes, "H6", { class: true });
			var h61_nodes = children(h61);
			t2 = claim_text(h61_nodes, t2_value);
			h61_nodes.forEach(detach);
			t3 = claim_space(div_nodes);
			p0 = claim_element(div_nodes, "P", { class: true });
			var p0_nodes = children(p0);
			t4 = claim_text(p0_nodes, t4_value);
			p0_nodes.forEach(detach);
			t5 = claim_space(div_nodes);
			h62 = claim_element(div_nodes, "H6", { class: true });
			var h62_nodes = children(h62);
			t6 = claim_text(h62_nodes, t6_value);
			h62_nodes.forEach(detach);
			t7 = claim_space(div_nodes);
			h63 = claim_element(div_nodes, "H6", { class: true });
			var h63_nodes = children(h63);
			t8 = claim_text(h63_nodes, t8_value);
			h63_nodes.forEach(detach);
			t9 = claim_space(div_nodes);
			p1 = claim_element(div_nodes, "P", { class: true });
			var p1_nodes = children(p1);
			t10 = claim_text(p1_nodes, t10_value);
			p1_nodes.forEach(detach);
			t11 = claim_space(div_nodes);
			h64 = claim_element(div_nodes, "H6", { class: true });
			var h64_nodes = children(h64);
			t12 = claim_text(h64_nodes, t12_value);
			h64_nodes.forEach(detach);
			t13 = claim_space(div_nodes);
			h65 = claim_element(div_nodes, "H6", { class: true });
			var h65_nodes = children(h65);
			t14 = claim_text(h65_nodes, t14_value);
			h65_nodes.forEach(detach);
			t15 = claim_space(div_nodes);
			p2 = claim_element(div_nodes, "P", { class: true });
			var p2_nodes = children(p2);
			t16 = claim_text(p2_nodes, t16_value);
			p2_nodes.forEach(detach);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h60, "class", "svelte-1n44zlp");
			attr(h61, "class", "h700 svelte-1n44zlp");
			attr(p0, "class", "p-medium svelte-1n44zlp");
			attr(h62, "class", "svelte-1n44zlp");
			attr(h63, "class", "h700 svelte-1n44zlp");
			attr(p1, "class", "p-medium svelte-1n44zlp");
			attr(h64, "class", "svelte-1n44zlp");
			attr(h65, "class", "h700 svelte-1n44zlp");
			attr(p2, "class", "p-medium svelte-1n44zlp");
			attr(div, "class", "overflow-teams-mobile svelte-1n44zlp");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, h60);
			append_hydration(h60, t0);
			append_hydration(div, t1);
			append_hydration(div, h61);
			append_hydration(h61, t2);
			append_hydration(div, t3);
			append_hydration(div, p0);
			append_hydration(p0, t4);
			append_hydration(div, t5);
			append_hydration(div, h62);
			append_hydration(h62, t6);
			append_hydration(div, t7);
			append_hydration(div, h63);
			append_hydration(h63, t8);
			append_hydration(div, t9);
			append_hydration(div, p1);
			append_hydration(p1, t10);
			append_hydration(div, t11);
			append_hydration(div, h64);
			append_hydration(h64, t12);
			append_hydration(div, t13);
			append_hydration(div, h65);
			append_hydration(h65, t14);
			append_hydration(div, t15);
			append_hydration(div, p2);
			append_hydration(p2, t16);
			current = true;
		},
		p(ctx, dirty) {
			if ((!current || dirty & /*team_member_4*/ 32) && t0_value !== (t0_value = /*team_member_4*/ ctx[5].name + "")) set_data(t0, t0_value);
			if ((!current || dirty & /*team_member_4*/ 32) && t2_value !== (t2_value = /*team_member_4*/ ctx[5].title + "")) set_data(t2, t2_value);
			if ((!current || dirty & /*team_member_4*/ 32) && t4_value !== (t4_value = /*team_member_4*/ ctx[5].description + "")) set_data(t4, t4_value);
			if ((!current || dirty & /*team_member_5*/ 64) && t6_value !== (t6_value = /*team_member_5*/ ctx[6].name + "")) set_data(t6, t6_value);
			if ((!current || dirty & /*team_member_5*/ 64) && t8_value !== (t8_value = /*team_member_5*/ ctx[6].title + "")) set_data(t8, t8_value);
			if ((!current || dirty & /*team_member_5*/ 64) && t10_value !== (t10_value = /*team_member_5*/ ctx[6].description + "")) set_data(t10, t10_value);
			if ((!current || dirty & /*team_member_6*/ 128) && t12_value !== (t12_value = /*team_member_6*/ ctx[7].name + "")) set_data(t12, t12_value);
			if ((!current || dirty & /*team_member_6*/ 128) && t14_value !== (t14_value = /*team_member_6*/ ctx[7].title + "")) set_data(t14, t14_value);
			if ((!current || dirty & /*team_member_6*/ 128) && t16_value !== (t16_value = /*team_member_6*/ ctx[7].description + "")) set_data(t16, t16_value);
		},
		i(local) {
			if (current) return;

			add_render_callback(() => {
				if (!current) return;
				if (!div_transition) div_transition = create_bidirectional_transition(div, fade, { duration: 200 }, true);
				div_transition.run(1);
			});

			current = true;
		},
		o(local) {
			if (!div_transition) div_transition = create_bidirectional_transition(div, fade, { duration: 200 }, false);
			div_transition.run(0);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(div);
			if (detaching && div_transition) div_transition.end();
		}
	};
}

// (332:10) {#if !clicked}
function create_if_block(ctx) {
	let button;
	let t;
	let mounted;
	let dispose;

	return {
		c() {
			button = element("button");
			t = text(/*action_button*/ ctx[0]);
			this.h();
		},
		l(nodes) {
			button = claim_element(nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			t = claim_text(button_nodes, /*action_button*/ ctx[0]);
			button_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(button, "class", "secondary-button svelte-1n44zlp");
		},
		m(target, anchor) {
			insert_hydration(target, button, anchor);
			append_hydration(button, t);

			if (!mounted) {
				dispose = listen(button, "click", /*click_handler*/ ctx[16]);
				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty & /*action_button*/ 1) set_data(t, /*action_button*/ ctx[0]);
		},
		d(detaching) {
			if (detaching) detach(button);
			mounted = false;
			dispose();
		}
	};
}

function create_fragment(ctx) {
	let div10;
	let div9;
	let div8;
	let div0;
	let h2;
	let t0;
	let t1;
	let h3;
	let t2;
	let t3;
	let div7;
	let div4;
	let div3;
	let div1;
	let h60;
	let t4_value = /*team_member_1*/ ctx[2].name + "";
	let t4;
	let t5;
	let h61;
	let t6_value = /*team_member_1*/ ctx[2].title + "";
	let t6;
	let t7;
	let p0;
	let t8_value = /*team_member_1*/ ctx[2].description + "";
	let t8;
	let t9;
	let h62;
	let t10_value = /*team_member_2*/ ctx[3].name + "";
	let t10;
	let t11;
	let h63;
	let t12_value = /*team_member_2*/ ctx[3].title + "";
	let t12;
	let t13;
	let p1;
	let t14_value = /*team_member_2*/ ctx[3].description + "";
	let t14;
	let t15;
	let h64;
	let t16_value = /*team_member_3*/ ctx[4].name + "";
	let t16;
	let t17;
	let h65;
	let t18_value = /*team_member_3*/ ctx[4].title + "";
	let t18;
	let t19;
	let p2;
	let t20_value = /*team_member_3*/ ctx[4].description + "";
	let t20;
	let t21;
	let img;
	let img_src_value;
	let img_alt_value;
	let t22;
	let div2;
	let h66;
	let t23_value = /*team_member_4*/ ctx[5].name + "";
	let t23;
	let t24;
	let h67;
	let t25_value = /*team_member_4*/ ctx[5].title + "";
	let t25;
	let t26;
	let p3;
	let t27_value = /*team_member_4*/ ctx[5].description + "";
	let t27;
	let t28;
	let h68;
	let t29_value = /*team_member_5*/ ctx[6].name + "";
	let t29;
	let t30;
	let h69;
	let t31_value = /*team_member_5*/ ctx[6].title + "";
	let t31;
	let t32;
	let p4;
	let t33_value = /*team_member_5*/ ctx[6].description + "";
	let t33;
	let t34;
	let h610;
	let t35_value = /*team_member_6*/ ctx[7].name + "";
	let t35;
	let t36;
	let h611;
	let t37_value = /*team_member_6*/ ctx[7].title + "";
	let t37;
	let t38;
	let p5;
	let t39_value = /*team_member_6*/ ctx[7].description + "";
	let t39;
	let t40;
	let t41;
	let t42;
	let div6;
	let div5;
	let h4;
	let t43;
	let t44;
	let p6;
	let t45;
	let current;
	let if_block0 = /*toggleTeams*/ ctx[13] && create_if_block_1(ctx);
	let if_block1 = !/*clicked*/ ctx[12] && create_if_block(ctx);

	return {
		c() {
			div10 = element("div");
			div9 = element("div");
			div8 = element("div");
			div0 = element("div");
			h2 = element("h2");
			t0 = text(/*content_title_1*/ ctx[8]);
			t1 = space();
			h3 = element("h3");
			t2 = text(/*content_subtitle_1*/ ctx[10]);
			t3 = space();
			div7 = element("div");
			div4 = element("div");
			div3 = element("div");
			div1 = element("div");
			h60 = element("h6");
			t4 = text(t4_value);
			t5 = space();
			h61 = element("h6");
			t6 = text(t6_value);
			t7 = space();
			p0 = element("p");
			t8 = text(t8_value);
			t9 = space();
			h62 = element("h6");
			t10 = text(t10_value);
			t11 = space();
			h63 = element("h6");
			t12 = text(t12_value);
			t13 = space();
			p1 = element("p");
			t14 = text(t14_value);
			t15 = space();
			h64 = element("h6");
			t16 = text(t16_value);
			t17 = space();
			h65 = element("h6");
			t18 = text(t18_value);
			t19 = space();
			p2 = element("p");
			t20 = text(t20_value);
			t21 = space();
			img = element("img");
			t22 = space();
			div2 = element("div");
			h66 = element("h6");
			t23 = text(t23_value);
			t24 = space();
			h67 = element("h6");
			t25 = text(t25_value);
			t26 = space();
			p3 = element("p");
			t27 = text(t27_value);
			t28 = space();
			h68 = element("h6");
			t29 = text(t29_value);
			t30 = space();
			h69 = element("h6");
			t31 = text(t31_value);
			t32 = space();
			p4 = element("p");
			t33 = text(t33_value);
			t34 = space();
			h610 = element("h6");
			t35 = text(t35_value);
			t36 = space();
			h611 = element("h6");
			t37 = text(t37_value);
			t38 = space();
			p5 = element("p");
			t39 = text(t39_value);
			t40 = space();
			if (if_block0) if_block0.c();
			t41 = space();
			if (if_block1) if_block1.c();
			t42 = space();
			div6 = element("div");
			div5 = element("div");
			h4 = element("h4");
			t43 = text(/*content_title_2*/ ctx[9]);
			t44 = space();
			p6 = element("p");
			t45 = text(/*content_description_2*/ ctx[11]);
			this.h();
		},
		l(nodes) {
			div10 = claim_element(nodes, "DIV", { class: true });
			var div10_nodes = children(div10);
			div9 = claim_element(div10_nodes, "DIV", { class: true });
			var div9_nodes = children(div9);
			div8 = claim_element(div9_nodes, "DIV", { class: true });
			var div8_nodes = children(div8);
			div0 = claim_element(div8_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h2 = claim_element(div0_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t0 = claim_text(h2_nodes, /*content_title_1*/ ctx[8]);
			h2_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t1 = claim_space(div8_nodes);
			h3 = claim_element(div8_nodes, "H3", { class: true });
			var h3_nodes = children(h3);
			t2 = claim_text(h3_nodes, /*content_subtitle_1*/ ctx[10]);
			h3_nodes.forEach(detach);
			t3 = claim_space(div8_nodes);
			div7 = claim_element(div8_nodes, "DIV", {});
			var div7_nodes = children(div7);
			div4 = claim_element(div7_nodes, "DIV", {});
			var div4_nodes = children(div4);
			div3 = claim_element(div4_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			div1 = claim_element(div3_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			h60 = claim_element(div1_nodes, "H6", { class: true });
			var h60_nodes = children(h60);
			t4 = claim_text(h60_nodes, t4_value);
			h60_nodes.forEach(detach);
			t5 = claim_space(div1_nodes);
			h61 = claim_element(div1_nodes, "H6", { class: true });
			var h61_nodes = children(h61);
			t6 = claim_text(h61_nodes, t6_value);
			h61_nodes.forEach(detach);
			t7 = claim_space(div1_nodes);
			p0 = claim_element(div1_nodes, "P", { class: true });
			var p0_nodes = children(p0);
			t8 = claim_text(p0_nodes, t8_value);
			p0_nodes.forEach(detach);
			t9 = claim_space(div1_nodes);
			h62 = claim_element(div1_nodes, "H6", { class: true });
			var h62_nodes = children(h62);
			t10 = claim_text(h62_nodes, t10_value);
			h62_nodes.forEach(detach);
			t11 = claim_space(div1_nodes);
			h63 = claim_element(div1_nodes, "H6", { class: true });
			var h63_nodes = children(h63);
			t12 = claim_text(h63_nodes, t12_value);
			h63_nodes.forEach(detach);
			t13 = claim_space(div1_nodes);
			p1 = claim_element(div1_nodes, "P", { class: true });
			var p1_nodes = children(p1);
			t14 = claim_text(p1_nodes, t14_value);
			p1_nodes.forEach(detach);
			t15 = claim_space(div1_nodes);
			h64 = claim_element(div1_nodes, "H6", { class: true });
			var h64_nodes = children(h64);
			t16 = claim_text(h64_nodes, t16_value);
			h64_nodes.forEach(detach);
			t17 = claim_space(div1_nodes);
			h65 = claim_element(div1_nodes, "H6", { class: true });
			var h65_nodes = children(h65);
			t18 = claim_text(h65_nodes, t18_value);
			h65_nodes.forEach(detach);
			t19 = claim_space(div1_nodes);
			p2 = claim_element(div1_nodes, "P", { class: true });
			var p2_nodes = children(p2);
			t20 = claim_text(p2_nodes, t20_value);
			p2_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t21 = claim_space(div3_nodes);

			img = claim_element(div3_nodes, "IMG", {
				id: true,
				src: true,
				alt: true,
				class: true
			});

			t22 = claim_space(div3_nodes);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			h66 = claim_element(div2_nodes, "H6", { class: true });
			var h66_nodes = children(h66);
			t23 = claim_text(h66_nodes, t23_value);
			h66_nodes.forEach(detach);
			t24 = claim_space(div2_nodes);
			h67 = claim_element(div2_nodes, "H6", { class: true });
			var h67_nodes = children(h67);
			t25 = claim_text(h67_nodes, t25_value);
			h67_nodes.forEach(detach);
			t26 = claim_space(div2_nodes);
			p3 = claim_element(div2_nodes, "P", { class: true });
			var p3_nodes = children(p3);
			t27 = claim_text(p3_nodes, t27_value);
			p3_nodes.forEach(detach);
			t28 = claim_space(div2_nodes);
			h68 = claim_element(div2_nodes, "H6", { class: true });
			var h68_nodes = children(h68);
			t29 = claim_text(h68_nodes, t29_value);
			h68_nodes.forEach(detach);
			t30 = claim_space(div2_nodes);
			h69 = claim_element(div2_nodes, "H6", { class: true });
			var h69_nodes = children(h69);
			t31 = claim_text(h69_nodes, t31_value);
			h69_nodes.forEach(detach);
			t32 = claim_space(div2_nodes);
			p4 = claim_element(div2_nodes, "P", { class: true });
			var p4_nodes = children(p4);
			t33 = claim_text(p4_nodes, t33_value);
			p4_nodes.forEach(detach);
			t34 = claim_space(div2_nodes);
			h610 = claim_element(div2_nodes, "H6", { class: true });
			var h610_nodes = children(h610);
			t35 = claim_text(h610_nodes, t35_value);
			h610_nodes.forEach(detach);
			t36 = claim_space(div2_nodes);
			h611 = claim_element(div2_nodes, "H6", { class: true });
			var h611_nodes = children(h611);
			t37 = claim_text(h611_nodes, t37_value);
			h611_nodes.forEach(detach);
			t38 = claim_space(div2_nodes);
			p5 = claim_element(div2_nodes, "P", { class: true });
			var p5_nodes = children(p5);
			t39 = claim_text(p5_nodes, t39_value);
			p5_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			t40 = claim_space(div4_nodes);
			if (if_block0) if_block0.l(div4_nodes);
			t41 = claim_space(div4_nodes);
			if (if_block1) if_block1.l(div4_nodes);
			div4_nodes.forEach(detach);
			t42 = claim_space(div7_nodes);
			div6 = claim_element(div7_nodes, "DIV", { class: true });
			var div6_nodes = children(div6);
			div5 = claim_element(div6_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			h4 = claim_element(div5_nodes, "H4", { class: true });
			var h4_nodes = children(h4);
			t43 = claim_text(h4_nodes, /*content_title_2*/ ctx[9]);
			h4_nodes.forEach(detach);
			t44 = claim_space(div5_nodes);
			p6 = claim_element(div5_nodes, "P", { class: true });
			var p6_nodes = children(p6);
			t45 = claim_text(p6_nodes, /*content_description_2*/ ctx[11]);
			p6_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			div6_nodes.forEach(detach);
			div7_nodes.forEach(detach);
			div8_nodes.forEach(detach);
			div9_nodes.forEach(detach);
			div10_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h2, "class", "svelte-1n44zlp");
			attr(div0, "class", "hero-text-container svelte-1n44zlp");
			attr(h3, "class", "content-subtitle svelte-1n44zlp");
			attr(h60, "class", "svelte-1n44zlp");
			attr(h61, "class", "h700 svelte-1n44zlp");
			attr(p0, "class", "p-medium svelte-1n44zlp");
			attr(h62, "class", "svelte-1n44zlp");
			attr(h63, "class", "h700 svelte-1n44zlp");
			attr(p1, "class", "p-medium svelte-1n44zlp");
			attr(h64, "class", "svelte-1n44zlp");
			attr(h65, "class", "h700 svelte-1n44zlp");
			attr(p2, "class", "p-medium svelte-1n44zlp");
			attr(div1, "class", "content-group-1-desktop");
			attr(img, "id", "tree");
			if (!src_url_equal(img.src, img_src_value = /*content_image*/ ctx[1].url)) attr(img, "src", img_src_value);
			attr(img, "alt", img_alt_value = /*content_image*/ ctx[1].alt);
			attr(img, "class", "svelte-1n44zlp");
			attr(h66, "class", "svelte-1n44zlp");
			attr(h67, "class", "h700 svelte-1n44zlp");
			attr(p3, "class", "p-medium svelte-1n44zlp");
			attr(h68, "class", "svelte-1n44zlp");
			attr(h69, "class", "h700 svelte-1n44zlp");
			attr(p4, "class", "p-medium svelte-1n44zlp");
			attr(h610, "class", "svelte-1n44zlp");
			attr(h611, "class", "h700 svelte-1n44zlp");
			attr(p5, "class", "p-medium svelte-1n44zlp");
			attr(div2, "class", "content-group-2-desktop svelte-1n44zlp");
			attr(div3, "class", "content-group-desktop svelte-1n44zlp");
			attr(h4, "class", "svelte-1n44zlp");
			attr(p6, "class", "p-medium svelte-1n44zlp");
			attr(div5, "class", "content-wrapper-2 svelte-1n44zlp");
			attr(div6, "class", "content-container-2 svelte-1n44zlp");
			attr(div8, "class", "section-container content svelte-1n44zlp");
			attr(div9, "class", "wrapper svelte-1n44zlp");
			attr(div10, "class", "container svelte-1n44zlp");
		},
		m(target, anchor) {
			insert_hydration(target, div10, anchor);
			append_hydration(div10, div9);
			append_hydration(div9, div8);
			append_hydration(div8, div0);
			append_hydration(div0, h2);
			append_hydration(h2, t0);
			append_hydration(div8, t1);
			append_hydration(div8, h3);
			append_hydration(h3, t2);
			append_hydration(div8, t3);
			append_hydration(div8, div7);
			append_hydration(div7, div4);
			append_hydration(div4, div3);
			append_hydration(div3, div1);
			append_hydration(div1, h60);
			append_hydration(h60, t4);
			append_hydration(div1, t5);
			append_hydration(div1, h61);
			append_hydration(h61, t6);
			append_hydration(div1, t7);
			append_hydration(div1, p0);
			append_hydration(p0, t8);
			append_hydration(div1, t9);
			append_hydration(div1, h62);
			append_hydration(h62, t10);
			append_hydration(div1, t11);
			append_hydration(div1, h63);
			append_hydration(h63, t12);
			append_hydration(div1, t13);
			append_hydration(div1, p1);
			append_hydration(p1, t14);
			append_hydration(div1, t15);
			append_hydration(div1, h64);
			append_hydration(h64, t16);
			append_hydration(div1, t17);
			append_hydration(div1, h65);
			append_hydration(h65, t18);
			append_hydration(div1, t19);
			append_hydration(div1, p2);
			append_hydration(p2, t20);
			append_hydration(div3, t21);
			append_hydration(div3, img);
			append_hydration(div3, t22);
			append_hydration(div3, div2);
			append_hydration(div2, h66);
			append_hydration(h66, t23);
			append_hydration(div2, t24);
			append_hydration(div2, h67);
			append_hydration(h67, t25);
			append_hydration(div2, t26);
			append_hydration(div2, p3);
			append_hydration(p3, t27);
			append_hydration(div2, t28);
			append_hydration(div2, h68);
			append_hydration(h68, t29);
			append_hydration(div2, t30);
			append_hydration(div2, h69);
			append_hydration(h69, t31);
			append_hydration(div2, t32);
			append_hydration(div2, p4);
			append_hydration(p4, t33);
			append_hydration(div2, t34);
			append_hydration(div2, h610);
			append_hydration(h610, t35);
			append_hydration(div2, t36);
			append_hydration(div2, h611);
			append_hydration(h611, t37);
			append_hydration(div2, t38);
			append_hydration(div2, p5);
			append_hydration(p5, t39);
			append_hydration(div4, t40);
			if (if_block0) if_block0.m(div4, null);
			append_hydration(div4, t41);
			if (if_block1) if_block1.m(div4, null);
			append_hydration(div7, t42);
			append_hydration(div7, div6);
			append_hydration(div6, div5);
			append_hydration(div5, h4);
			append_hydration(h4, t43);
			append_hydration(div5, t44);
			append_hydration(div5, p6);
			append_hydration(p6, t45);
			current = true;
		},
		p(ctx, [dirty]) {
			if (!current || dirty & /*content_title_1*/ 256) set_data(t0, /*content_title_1*/ ctx[8]);
			if (!current || dirty & /*content_subtitle_1*/ 1024) set_data(t2, /*content_subtitle_1*/ ctx[10]);
			if ((!current || dirty & /*team_member_1*/ 4) && t4_value !== (t4_value = /*team_member_1*/ ctx[2].name + "")) set_data(t4, t4_value);
			if ((!current || dirty & /*team_member_1*/ 4) && t6_value !== (t6_value = /*team_member_1*/ ctx[2].title + "")) set_data(t6, t6_value);
			if ((!current || dirty & /*team_member_1*/ 4) && t8_value !== (t8_value = /*team_member_1*/ ctx[2].description + "")) set_data(t8, t8_value);
			if ((!current || dirty & /*team_member_2*/ 8) && t10_value !== (t10_value = /*team_member_2*/ ctx[3].name + "")) set_data(t10, t10_value);
			if ((!current || dirty & /*team_member_2*/ 8) && t12_value !== (t12_value = /*team_member_2*/ ctx[3].title + "")) set_data(t12, t12_value);
			if ((!current || dirty & /*team_member_2*/ 8) && t14_value !== (t14_value = /*team_member_2*/ ctx[3].description + "")) set_data(t14, t14_value);
			if ((!current || dirty & /*team_member_3*/ 16) && t16_value !== (t16_value = /*team_member_3*/ ctx[4].name + "")) set_data(t16, t16_value);
			if ((!current || dirty & /*team_member_3*/ 16) && t18_value !== (t18_value = /*team_member_3*/ ctx[4].title + "")) set_data(t18, t18_value);
			if ((!current || dirty & /*team_member_3*/ 16) && t20_value !== (t20_value = /*team_member_3*/ ctx[4].description + "")) set_data(t20, t20_value);

			if (!current || dirty & /*content_image*/ 2 && !src_url_equal(img.src, img_src_value = /*content_image*/ ctx[1].url)) {
				attr(img, "src", img_src_value);
			}

			if (!current || dirty & /*content_image*/ 2 && img_alt_value !== (img_alt_value = /*content_image*/ ctx[1].alt)) {
				attr(img, "alt", img_alt_value);
			}

			if ((!current || dirty & /*team_member_4*/ 32) && t23_value !== (t23_value = /*team_member_4*/ ctx[5].name + "")) set_data(t23, t23_value);
			if ((!current || dirty & /*team_member_4*/ 32) && t25_value !== (t25_value = /*team_member_4*/ ctx[5].title + "")) set_data(t25, t25_value);
			if ((!current || dirty & /*team_member_4*/ 32) && t27_value !== (t27_value = /*team_member_4*/ ctx[5].description + "")) set_data(t27, t27_value);
			if ((!current || dirty & /*team_member_5*/ 64) && t29_value !== (t29_value = /*team_member_5*/ ctx[6].name + "")) set_data(t29, t29_value);
			if ((!current || dirty & /*team_member_5*/ 64) && t31_value !== (t31_value = /*team_member_5*/ ctx[6].title + "")) set_data(t31, t31_value);
			if ((!current || dirty & /*team_member_5*/ 64) && t33_value !== (t33_value = /*team_member_5*/ ctx[6].description + "")) set_data(t33, t33_value);
			if ((!current || dirty & /*team_member_6*/ 128) && t35_value !== (t35_value = /*team_member_6*/ ctx[7].name + "")) set_data(t35, t35_value);
			if ((!current || dirty & /*team_member_6*/ 128) && t37_value !== (t37_value = /*team_member_6*/ ctx[7].title + "")) set_data(t37, t37_value);
			if ((!current || dirty & /*team_member_6*/ 128) && t39_value !== (t39_value = /*team_member_6*/ ctx[7].description + "")) set_data(t39, t39_value);

			if (/*toggleTeams*/ ctx[13]) {
				if (if_block0) {
					if_block0.p(ctx, dirty);

					if (dirty & /*toggleTeams*/ 8192) {
						transition_in(if_block0, 1);
					}
				} else {
					if_block0 = create_if_block_1(ctx);
					if_block0.c();
					transition_in(if_block0, 1);
					if_block0.m(div4, t41);
				}
			} else if (if_block0) {
				group_outros();

				transition_out(if_block0, 1, 1, () => {
					if_block0 = null;
				});

				check_outros();
			}

			if (!/*clicked*/ ctx[12]) {
				if (if_block1) {
					if_block1.p(ctx, dirty);
				} else {
					if_block1 = create_if_block(ctx);
					if_block1.c();
					if_block1.m(div4, null);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}

			if (!current || dirty & /*content_title_2*/ 512) set_data(t43, /*content_title_2*/ ctx[9]);
			if (!current || dirty & /*content_description_2*/ 2048) set_data(t45, /*content_description_2*/ ctx[11]);
		},
		i(local) {
			if (current) return;
			transition_in(if_block0);
			current = true;
		},
		o(local) {
			transition_out(if_block0);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(div10);
			if (if_block0) if_block0.d();
			if (if_block1) if_block1.d();
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;
	let { content } = $$props;
	let { action_button } = $$props;
	let { content_image } = $$props;
	let { team_member_1 } = $$props;
	let { team_member_2 } = $$props;
	let { team_member_3 } = $$props;
	let { team_member_4 } = $$props;
	let { team_member_5 } = $$props;
	let { team_member_6 } = $$props;
	let { content_title_1 } = $$props;
	let { content_title_2 } = $$props;
	let { content_subtitle_1 } = $$props;
	let { content_description_2 } = $$props;
	let clicked = false;
	let toggleTeams = false;

	const click_handler = () => {
		$$invalidate(13, toggleTeams = true);
		$$invalidate(12, clicked = true);
	};

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(14, props = $$props.props);
		if ('content' in $$props) $$invalidate(15, content = $$props.content);
		if ('action_button' in $$props) $$invalidate(0, action_button = $$props.action_button);
		if ('content_image' in $$props) $$invalidate(1, content_image = $$props.content_image);
		if ('team_member_1' in $$props) $$invalidate(2, team_member_1 = $$props.team_member_1);
		if ('team_member_2' in $$props) $$invalidate(3, team_member_2 = $$props.team_member_2);
		if ('team_member_3' in $$props) $$invalidate(4, team_member_3 = $$props.team_member_3);
		if ('team_member_4' in $$props) $$invalidate(5, team_member_4 = $$props.team_member_4);
		if ('team_member_5' in $$props) $$invalidate(6, team_member_5 = $$props.team_member_5);
		if ('team_member_6' in $$props) $$invalidate(7, team_member_6 = $$props.team_member_6);
		if ('content_title_1' in $$props) $$invalidate(8, content_title_1 = $$props.content_title_1);
		if ('content_title_2' in $$props) $$invalidate(9, content_title_2 = $$props.content_title_2);
		if ('content_subtitle_1' in $$props) $$invalidate(10, content_subtitle_1 = $$props.content_subtitle_1);
		if ('content_description_2' in $$props) $$invalidate(11, content_description_2 = $$props.content_description_2);
	};

	return [
		action_button,
		content_image,
		team_member_1,
		team_member_2,
		team_member_3,
		team_member_4,
		team_member_5,
		team_member_6,
		content_title_1,
		content_title_2,
		content_subtitle_1,
		content_description_2,
		clicked,
		toggleTeams,
		props,
		content,
		click_handler
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance, create_fragment, safe_not_equal, {
			props: 14,
			content: 15,
			action_button: 0,
			content_image: 1,
			team_member_1: 2,
			team_member_2: 3,
			team_member_3: 4,
			team_member_4: 5,
			team_member_5: 6,
			team_member_6: 7,
			content_title_1: 8,
			content_title_2: 9,
			content_subtitle_1: 10,
			content_description_2: 11
		});
	}
}

export { Component as default };
