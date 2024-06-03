// Content 3 - Home - Updated June 3, 2024
function noop() { }
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
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function set_custom_element_data(node, prop, value) {
    if (prop in node) {
        node[prop] = typeof node[prop] === 'boolean' && value === '' ? true : value;
    }
    else {
        attr(node, prop, value);
    }
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
const outroing = new Set();
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
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

/* generated by Svelte v3.59.1 */

function create_fragment(ctx) {
	let div15;
	let div14;
	let div5;
	let div3;
	let div0;
	let h60;
	let t0;
	let t1;
	let h40;
	let t2;
	let t3;
	let p0;
	let t4;
	let t5;
	let p1;
	let t6;
	let t7;
	let div1;
	let lottie_player0;
	let lottie_player0_src_value;
	let t8;
	let img0;
	let img0_src_value;
	let img0_alt_value;
	let t9;
	let div2;
	let a0;
	let t10_value = /*content_action_1*/ ctx[7].label + "";
	let t10;
	let a0_href_value;
	let t11;
	let div4;
	let lottie_player1;
	let lottie_player1_src_value;
	let t12;
	let img1;
	let img1_src_value;
	let img1_alt_value;
	let t13;
	let div13;
	let div6;
	let lottie_player2;
	let lottie_player2_src_value;
	let t14;
	let img2;
	let img2_src_value;
	let img2_alt_value;
	let t15;
	let div12;
	let div7;
	let h61;
	let t16;
	let t17;
	let h41;
	let t18;
	let t19;
	let p2;
	let t20;
	let t21;
	let div8;
	let img3;
	let img3_src_value;
	let img3_alt_value;
	let t22;
	let p3;
	let t23;
	let t24;
	let div9;
	let img4;
	let img4_src_value;
	let img4_alt_value;
	let t25;
	let p4;
	let t26;
	let t27;
	let p5;
	let t28;
	let t29;
	let div10;
	let lottie_player3;
	let lottie_player3_src_value;
	let t30;
	let img5;
	let img5_src_value;
	let img5_alt_value;
	let t31;
	let div11;
	let a1;
	let t32_value = /*content_action_2*/ ctx[8].label + "";
	let t32;
	let a1_href_value;

	return {
		c() {
			div15 = element("div");
			div14 = element("div");
			div5 = element("div");
			div3 = element("div");
			div0 = element("div");
			h60 = element("h6");
			t0 = text(/*content_tag_1*/ ctx[1]);
			t1 = space();
			h40 = element("h4");
			t2 = text(/*content_title_1*/ ctx[5]);
			t3 = space();
			p0 = element("p");
			t4 = text(/*content_description_1a*/ ctx[9]);
			t5 = space();
			p1 = element("p");
			t6 = text(/*content_description_1b*/ ctx[10]);
			t7 = space();
			div1 = element("div");
			lottie_player0 = element("lottie-player");
			t8 = space();
			img0 = element("img");
			t9 = space();
			div2 = element("div");
			a0 = element("a");
			t10 = text(t10_value);
			t11 = space();
			div4 = element("div");
			lottie_player1 = element("lottie-player");
			t12 = space();
			img1 = element("img");
			t13 = space();
			div13 = element("div");
			div6 = element("div");
			lottie_player2 = element("lottie-player");
			t14 = space();
			img2 = element("img");
			t15 = space();
			div12 = element("div");
			div7 = element("div");
			h61 = element("h6");
			t16 = text(/*content_tag_2*/ ctx[2]);
			t17 = space();
			h41 = element("h4");
			t18 = text(/*content_title_2*/ ctx[6]);
			t19 = space();
			p2 = element("p");
			t20 = text(/*content_description_2a*/ ctx[11]);
			t21 = space();
			div8 = element("div");
			img3 = element("img");
			t22 = space();
			p3 = element("p");
			t23 = text(/*content_description_2b*/ ctx[12]);
			t24 = space();
			div9 = element("div");
			img4 = element("img");
			t25 = space();
			p4 = element("p");
			t26 = text(/*content_description_2c*/ ctx[13]);
			t27 = space();
			p5 = element("p");
			t28 = text(/*content_description_2d*/ ctx[14]);
			t29 = space();
			div10 = element("div");
			lottie_player3 = element("lottie-player");
			t30 = space();
			img5 = element("img");
			t31 = space();
			div11 = element("div");
			a1 = element("a");
			t32 = text(t32_value);
			this.h();
		},
		l(nodes) {
			div15 = claim_element(nodes, "DIV", { class: true });
			var div15_nodes = children(div15);
			div14 = claim_element(div15_nodes, "DIV", { class: true });
			var div14_nodes = children(div14);
			div5 = claim_element(div14_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			div3 = claim_element(div5_nodes, "DIV", {});
			var div3_nodes = children(div3);
			div0 = claim_element(div3_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h60 = claim_element(div0_nodes, "H6", {});
			var h60_nodes = children(h60);
			t0 = claim_text(h60_nodes, /*content_tag_1*/ ctx[1]);
			h60_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t1 = claim_space(div3_nodes);
			h40 = claim_element(div3_nodes, "H4", {});
			var h40_nodes = children(h40);
			t2 = claim_text(h40_nodes, /*content_title_1*/ ctx[5]);
			h40_nodes.forEach(detach);
			t3 = claim_space(div3_nodes);
			p0 = claim_element(div3_nodes, "P", { class: true });
			var p0_nodes = children(p0);
			t4 = claim_text(p0_nodes, /*content_description_1a*/ ctx[9]);
			p0_nodes.forEach(detach);
			t5 = claim_space(div3_nodes);
			p1 = claim_element(div3_nodes, "P", { class: true });
			var p1_nodes = children(p1);
			t6 = claim_text(p1_nodes, /*content_description_1b*/ ctx[10]);
			p1_nodes.forEach(detach);
			t7 = claim_space(div3_nodes);
			div1 = claim_element(div3_nodes, "DIV", { id: true, class: true });
			var div1_nodes = children(div1);

			lottie_player0 = claim_element(div1_nodes, "LOTTIE-PLAYER", {
				autoplay: true,
				loop: true,
				mode: true,
				class: true,
				src: true
			});

			children(lottie_player0).forEach(detach);
			t8 = claim_space(div1_nodes);

			img0 = claim_element(div1_nodes, "IMG", {
				id: true,
				src: true,
				alt: true,
				class: true
			});

			div1_nodes.forEach(detach);
			t9 = claim_space(div3_nodes);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			a0 = claim_element(div2_nodes, "A", { class: true, href: true });
			var a0_nodes = children(a0);
			t10 = claim_text(a0_nodes, t10_value);
			a0_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			t11 = claim_space(div5_nodes);
			div4 = claim_element(div5_nodes, "DIV", { id: true, class: true });
			var div4_nodes = children(div4);

			lottie_player1 = claim_element(div4_nodes, "LOTTIE-PLAYER", {
				autoplay: true,
				loop: true,
				mode: true,
				class: true,
				src: true
			});

			children(lottie_player1).forEach(detach);
			t12 = claim_space(div4_nodes);

			img1 = claim_element(div4_nodes, "IMG", {
				id: true,
				src: true,
				alt: true,
				class: true
			});

			div4_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			t13 = claim_space(div14_nodes);
			div13 = claim_element(div14_nodes, "DIV", { class: true });
			var div13_nodes = children(div13);
			div6 = claim_element(div13_nodes, "DIV", { id: true, class: true });
			var div6_nodes = children(div6);

			lottie_player2 = claim_element(div6_nodes, "LOTTIE-PLAYER", {
				autoplay: true,
				loop: true,
				mode: true,
				class: true,
				src: true
			});

			children(lottie_player2).forEach(detach);
			t14 = claim_space(div6_nodes);

			img2 = claim_element(div6_nodes, "IMG", {
				id: true,
				src: true,
				alt: true,
				class: true
			});

			div6_nodes.forEach(detach);
			t15 = claim_space(div13_nodes);
			div12 = claim_element(div13_nodes, "DIV", {});
			var div12_nodes = children(div12);
			div7 = claim_element(div12_nodes, "DIV", { class: true });
			var div7_nodes = children(div7);
			h61 = claim_element(div7_nodes, "H6", {});
			var h61_nodes = children(h61);
			t16 = claim_text(h61_nodes, /*content_tag_2*/ ctx[2]);
			h61_nodes.forEach(detach);
			div7_nodes.forEach(detach);
			t17 = claim_space(div12_nodes);
			h41 = claim_element(div12_nodes, "H4", {});
			var h41_nodes = children(h41);
			t18 = claim_text(h41_nodes, /*content_title_2*/ ctx[6]);
			h41_nodes.forEach(detach);
			t19 = claim_space(div12_nodes);
			p2 = claim_element(div12_nodes, "P", { class: true });
			var p2_nodes = children(p2);
			t20 = claim_text(p2_nodes, /*content_description_2a*/ ctx[11]);
			p2_nodes.forEach(detach);
			t21 = claim_space(div12_nodes);
			div8 = claim_element(div12_nodes, "DIV", { class: true });
			var div8_nodes = children(div8);
			img3 = claim_element(div8_nodes, "IMG", { src: true, alt: true });
			t22 = claim_space(div8_nodes);
			p3 = claim_element(div8_nodes, "P", { class: true });
			var p3_nodes = children(p3);
			t23 = claim_text(p3_nodes, /*content_description_2b*/ ctx[12]);
			p3_nodes.forEach(detach);
			div8_nodes.forEach(detach);
			t24 = claim_space(div12_nodes);
			div9 = claim_element(div12_nodes, "DIV", { class: true });
			var div9_nodes = children(div9);
			img4 = claim_element(div9_nodes, "IMG", { src: true, alt: true });
			t25 = claim_space(div9_nodes);
			p4 = claim_element(div9_nodes, "P", { class: true });
			var p4_nodes = children(p4);
			t26 = claim_text(p4_nodes, /*content_description_2c*/ ctx[13]);
			p4_nodes.forEach(detach);
			div9_nodes.forEach(detach);
			t27 = claim_space(div12_nodes);
			p5 = claim_element(div12_nodes, "P", { class: true });
			var p5_nodes = children(p5);
			t28 = claim_text(p5_nodes, /*content_description_2d*/ ctx[14]);
			p5_nodes.forEach(detach);
			t29 = claim_space(div12_nodes);
			div10 = claim_element(div12_nodes, "DIV", { id: true, class: true });
			var div10_nodes = children(div10);

			lottie_player3 = claim_element(div10_nodes, "LOTTIE-PLAYER", {
				autoplay: true,
				loop: true,
				mode: true,
				class: true,
				src: true
			});

			children(lottie_player3).forEach(detach);
			t30 = claim_space(div10_nodes);

			img5 = claim_element(div10_nodes, "IMG", {
				id: true,
				src: true,
				alt: true,
				class: true
			});

			div10_nodes.forEach(detach);
			t31 = claim_space(div12_nodes);
			div11 = claim_element(div12_nodes, "DIV", { class: true });
			var div11_nodes = children(div11);
			a1 = claim_element(div11_nodes, "A", { class: true, href: true });
			var a1_nodes = children(a1);
			t32 = claim_text(a1_nodes, t32_value);
			a1_nodes.forEach(detach);
			div11_nodes.forEach(detach);
			div12_nodes.forEach(detach);
			div13_nodes.forEach(detach);
			div14_nodes.forEach(detach);
			div15_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "tag-pink-large svelte-1esknib");
			attr(p0, "class", "p-medium");
			attr(p1, "class", "p-medium");
			set_custom_element_data(lottie_player0, "autoplay", "");
			set_custom_element_data(lottie_player0, "loop", "");
			set_custom_element_data(lottie_player0, "mode", "normal");
			set_custom_element_data(lottie_player0, "class", "lottie-1 svelte-1esknib");
			if (!src_url_equal(lottie_player0.src, lottie_player0_src_value = eyeLottie)) set_custom_element_data(lottie_player0, "src", lottie_player0_src_value);
			attr(img0, "id", "content-image-1");
			if (!src_url_equal(img0.src, img0_src_value = /*content_image_1*/ ctx[3].url)) attr(img0, "src", img0_src_value);
			attr(img0, "alt", img0_alt_value = /*content_image_1*/ ctx[3].alt);
			attr(img0, "class", "svelte-1esknib");
			attr(div1, "id", "content-image-mobile-1");
			attr(div1, "class", "svelte-1esknib");
			attr(a0, "class", "primary-large-button svelte-1esknib");
			attr(a0, "href", a0_href_value = /*content_action_1*/ ctx[7].url);
			attr(div2, "class", "button-wrapper svelte-1esknib");
			set_custom_element_data(lottie_player1, "autoplay", "");
			set_custom_element_data(lottie_player1, "loop", "");
			set_custom_element_data(lottie_player1, "mode", "normal");
			set_custom_element_data(lottie_player1, "class", "lottie-1 svelte-1esknib");
			if (!src_url_equal(lottie_player1.src, lottie_player1_src_value = eyeLottie)) set_custom_element_data(lottie_player1, "src", lottie_player1_src_value);
			attr(img1, "id", "content-image-1");
			if (!src_url_equal(img1.src, img1_src_value = /*content_image_1*/ ctx[3].url)) attr(img1, "src", img1_src_value);
			attr(img1, "alt", img1_alt_value = /*content_image_1*/ ctx[3].alt);
			attr(img1, "class", "svelte-1esknib");
			attr(div4, "id", "content-image-desktop-1");
			attr(div4, "class", "svelte-1esknib");
			attr(div5, "class", "section-container content svelte-1esknib");
			set_custom_element_data(lottie_player2, "autoplay", "");
			set_custom_element_data(lottie_player2, "loop", "");
			set_custom_element_data(lottie_player2, "mode", "normal");
			set_custom_element_data(lottie_player2, "class", "lottie-2 svelte-1esknib");
			if (!src_url_equal(lottie_player2.src, lottie_player2_src_value = piebarchartLottie)) set_custom_element_data(lottie_player2, "src", lottie_player2_src_value);
			attr(img2, "id", "content-image-2");
			if (!src_url_equal(img2.src, img2_src_value = /*content_image_2*/ ctx[4].url)) attr(img2, "src", img2_src_value);
			attr(img2, "alt", img2_alt_value = /*content_image_2*/ ctx[4].alt);
			attr(img2, "class", "svelte-1esknib");
			attr(div6, "id", "content-image-desktop-2");
			attr(div6, "class", "svelte-1esknib");
			attr(div7, "class", "tag-yellow-large svelte-1esknib");
			attr(p2, "class", "p-medium");
			if (!src_url_equal(img3.src, img3_src_value = /*checkmark*/ ctx[0].url)) attr(img3, "src", img3_src_value);
			attr(img3, "alt", img3_alt_value = /*checkmark*/ ctx[0].alt);
			attr(p3, "class", "p-medium");
			attr(div8, "class", "content-wrapper svelte-1esknib");
			if (!src_url_equal(img4.src, img4_src_value = /*checkmark*/ ctx[0].url)) attr(img4, "src", img4_src_value);
			attr(img4, "alt", img4_alt_value = /*checkmark*/ ctx[0].alt);
			attr(p4, "class", "p-medium");
			attr(div9, "class", "content-wrapper svelte-1esknib");
			attr(p5, "class", "p-medium");
			set_custom_element_data(lottie_player3, "autoplay", "");
			set_custom_element_data(lottie_player3, "loop", "");
			set_custom_element_data(lottie_player3, "mode", "normal");
			set_custom_element_data(lottie_player3, "class", "lottie-2 svelte-1esknib");
			if (!src_url_equal(lottie_player3.src, lottie_player3_src_value = piebarchartLottie)) set_custom_element_data(lottie_player3, "src", lottie_player3_src_value);
			attr(img5, "id", "content-image-2");
			if (!src_url_equal(img5.src, img5_src_value = /*content_image_2*/ ctx[4].url)) attr(img5, "src", img5_src_value);
			attr(img5, "alt", img5_alt_value = /*content_image_2*/ ctx[4].alt);
			attr(img5, "class", "svelte-1esknib");
			attr(div10, "id", "content-image-mobile-2");
			attr(div10, "class", "svelte-1esknib");
			attr(a1, "class", "primary-large-button svelte-1esknib");
			attr(a1, "href", a1_href_value = /*content_action_2*/ ctx[8].url);
			attr(div11, "class", "button-wrapper svelte-1esknib");
			attr(div13, "class", "section-container content svelte-1esknib");
			attr(div14, "class", "wrapper svelte-1esknib");
			attr(div15, "class", "container svelte-1esknib");
		},
		m(target, anchor) {
			insert_hydration(target, div15, anchor);
			append_hydration(div15, div14);
			append_hydration(div14, div5);
			append_hydration(div5, div3);
			append_hydration(div3, div0);
			append_hydration(div0, h60);
			append_hydration(h60, t0);
			append_hydration(div3, t1);
			append_hydration(div3, h40);
			append_hydration(h40, t2);
			append_hydration(div3, t3);
			append_hydration(div3, p0);
			append_hydration(p0, t4);
			append_hydration(div3, t5);
			append_hydration(div3, p1);
			append_hydration(p1, t6);
			append_hydration(div3, t7);
			append_hydration(div3, div1);
			append_hydration(div1, lottie_player0);
			append_hydration(div1, t8);
			append_hydration(div1, img0);
			append_hydration(div3, t9);
			append_hydration(div3, div2);
			append_hydration(div2, a0);
			append_hydration(a0, t10);
			append_hydration(div5, t11);
			append_hydration(div5, div4);
			append_hydration(div4, lottie_player1);
			append_hydration(div4, t12);
			append_hydration(div4, img1);
			append_hydration(div14, t13);
			append_hydration(div14, div13);
			append_hydration(div13, div6);
			append_hydration(div6, lottie_player2);
			append_hydration(div6, t14);
			append_hydration(div6, img2);
			append_hydration(div13, t15);
			append_hydration(div13, div12);
			append_hydration(div12, div7);
			append_hydration(div7, h61);
			append_hydration(h61, t16);
			append_hydration(div12, t17);
			append_hydration(div12, h41);
			append_hydration(h41, t18);
			append_hydration(div12, t19);
			append_hydration(div12, p2);
			append_hydration(p2, t20);
			append_hydration(div12, t21);
			append_hydration(div12, div8);
			append_hydration(div8, img3);
			append_hydration(div8, t22);
			append_hydration(div8, p3);
			append_hydration(p3, t23);
			append_hydration(div12, t24);
			append_hydration(div12, div9);
			append_hydration(div9, img4);
			append_hydration(div9, t25);
			append_hydration(div9, p4);
			append_hydration(p4, t26);
			append_hydration(div12, t27);
			append_hydration(div12, p5);
			append_hydration(p5, t28);
			append_hydration(div12, t29);
			append_hydration(div12, div10);
			append_hydration(div10, lottie_player3);
			append_hydration(div10, t30);
			append_hydration(div10, img5);
			append_hydration(div12, t31);
			append_hydration(div12, div11);
			append_hydration(div11, a1);
			append_hydration(a1, t32);
		},
		p(ctx, [dirty]) {
			if (dirty & /*content_tag_1*/ 2) set_data(t0, /*content_tag_1*/ ctx[1]);
			if (dirty & /*content_title_1*/ 32) set_data(t2, /*content_title_1*/ ctx[5]);
			if (dirty & /*content_description_1a*/ 512) set_data(t4, /*content_description_1a*/ ctx[9]);
			if (dirty & /*content_description_1b*/ 1024) set_data(t6, /*content_description_1b*/ ctx[10]);

			if (dirty & /*content_image_1*/ 8 && !src_url_equal(img0.src, img0_src_value = /*content_image_1*/ ctx[3].url)) {
				attr(img0, "src", img0_src_value);
			}

			if (dirty & /*content_image_1*/ 8 && img0_alt_value !== (img0_alt_value = /*content_image_1*/ ctx[3].alt)) {
				attr(img0, "alt", img0_alt_value);
			}

			if (dirty & /*content_action_1*/ 128 && t10_value !== (t10_value = /*content_action_1*/ ctx[7].label + "")) set_data(t10, t10_value);

			if (dirty & /*content_action_1*/ 128 && a0_href_value !== (a0_href_value = /*content_action_1*/ ctx[7].url)) {
				attr(a0, "href", a0_href_value);
			}

			if (dirty & /*content_image_1*/ 8 && !src_url_equal(img1.src, img1_src_value = /*content_image_1*/ ctx[3].url)) {
				attr(img1, "src", img1_src_value);
			}

			if (dirty & /*content_image_1*/ 8 && img1_alt_value !== (img1_alt_value = /*content_image_1*/ ctx[3].alt)) {
				attr(img1, "alt", img1_alt_value);
			}

			if (dirty & /*content_image_2*/ 16 && !src_url_equal(img2.src, img2_src_value = /*content_image_2*/ ctx[4].url)) {
				attr(img2, "src", img2_src_value);
			}

			if (dirty & /*content_image_2*/ 16 && img2_alt_value !== (img2_alt_value = /*content_image_2*/ ctx[4].alt)) {
				attr(img2, "alt", img2_alt_value);
			}

			if (dirty & /*content_tag_2*/ 4) set_data(t16, /*content_tag_2*/ ctx[2]);
			if (dirty & /*content_title_2*/ 64) set_data(t18, /*content_title_2*/ ctx[6]);
			if (dirty & /*content_description_2a*/ 2048) set_data(t20, /*content_description_2a*/ ctx[11]);

			if (dirty & /*checkmark*/ 1 && !src_url_equal(img3.src, img3_src_value = /*checkmark*/ ctx[0].url)) {
				attr(img3, "src", img3_src_value);
			}

			if (dirty & /*checkmark*/ 1 && img3_alt_value !== (img3_alt_value = /*checkmark*/ ctx[0].alt)) {
				attr(img3, "alt", img3_alt_value);
			}

			if (dirty & /*content_description_2b*/ 4096) set_data(t23, /*content_description_2b*/ ctx[12]);

			if (dirty & /*checkmark*/ 1 && !src_url_equal(img4.src, img4_src_value = /*checkmark*/ ctx[0].url)) {
				attr(img4, "src", img4_src_value);
			}

			if (dirty & /*checkmark*/ 1 && img4_alt_value !== (img4_alt_value = /*checkmark*/ ctx[0].alt)) {
				attr(img4, "alt", img4_alt_value);
			}

			if (dirty & /*content_description_2c*/ 8192) set_data(t26, /*content_description_2c*/ ctx[13]);
			if (dirty & /*content_description_2d*/ 16384) set_data(t28, /*content_description_2d*/ ctx[14]);

			if (dirty & /*content_image_2*/ 16 && !src_url_equal(img5.src, img5_src_value = /*content_image_2*/ ctx[4].url)) {
				attr(img5, "src", img5_src_value);
			}

			if (dirty & /*content_image_2*/ 16 && img5_alt_value !== (img5_alt_value = /*content_image_2*/ ctx[4].alt)) {
				attr(img5, "alt", img5_alt_value);
			}

			if (dirty & /*content_action_2*/ 256 && t32_value !== (t32_value = /*content_action_2*/ ctx[8].label + "")) set_data(t32, t32_value);

			if (dirty & /*content_action_2*/ 256 && a1_href_value !== (a1_href_value = /*content_action_2*/ ctx[8].url)) {
				attr(a1, "href", a1_href_value);
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(div15);
		}
	};
}

const eyeLottie = '{"nm":"Comp 10","ddd":0,"h":500,"w":500,"meta":{"g":"@lottiefiles/toolkit-js 0.26.1"},"layers":[{"ty":4,"nm":"Layer 3","sr":1,"st":0,"op":100,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[0,31.128,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,0,100],"t":5},{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,100,100],"t":10},{"o":{"x":0.167,"y":0},"i":{"x":0.085,"y":1},"s":[100,100,100],"t":65},{"s":[100,0,100],"t":70}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[250,281.128,0],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2","nm":"Kleaner","ix":1,"en":1,"ef":[{"ty":7,"mn":"Pseudo/Duik Kleaner v3.2-0001","nm":"Anticipation","ix":1,"v":{"a":0,"k":0,"ix":1}},{"ty":7,"mn":"Pseudo/Duik Kleaner v3.2-0002","nm":"Smart Interpolation","ix":2,"v":{"a":0,"k":0,"ix":2}},{"ty":7,"mn":"Pseudo/Duik Kleaner v3.2-0003","nm":"Follow Through","ix":3,"v":{"a":0,"k":1,"ix":3}},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0004","nm":"Anticipation","ix":4,"v":0},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0005","nm":"Duration (s)","ix":5,"v":{"a":0,"k":0.3,"ix":5}},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0006","nm":"Amplitude","ix":6,"v":{"a":0,"k":50,"ix":6}},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0007","nm":"","ix":7,"v":0},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0008","nm":"Interpolation","ix":8,"v":0},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0009","nm":"Slow In","ix":9,"v":{"a":0,"k":60,"ix":9}},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0010","nm":"Slow Out","ix":10,"v":{"a":0,"k":25,"ix":10}},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0011","nm":"","ix":11,"v":0},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0012","nm":"Follow Through","ix":12,"v":0},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0013","nm":"Elasticity","ix":13,"v":{"a":0,"k":10,"ix":13}},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0014","nm":"Elasticity random","ix":14,"v":{"a":0,"k":0,"ix":14}},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0015","nm":"Damping","ix":15,"v":{"a":0,"k":50,"ix":15}},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0016","nm":"Damping random","ix":16,"v":{"a":0,"k":0,"ix":16}},{"ty":7,"mn":"Pseudo/Duik Kleaner v3.2-0017","nm":"Bounce","ix":17,"v":{"a":0,"k":0,"ix":17}},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0018","nm":"","ix":18,"v":0},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0019","nm":"Spatial Options","ix":19,"v":0},{"ty":7,"mn":"Pseudo/Duik Kleaner v3.2-0020","nm":"Smart Interpolation","ix":20,"v":{"a":0,"k":0,"ix":20}},{"ty":7,"mn":"Pseudo/Duik Kleaner v3.2-0021","nm":"Mode","ix":21,"v":{"a":0,"k":1,"ix":21}},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0022","nm":"Overlap (simulation)","ix":22,"v":0},{"ty":7,"mn":"Pseudo/Duik Kleaner v3.2-0023","nm":"Overlap","ix":23,"v":{"a":0,"k":1,"ix":23}},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0024","nm":"Delay (s)","ix":24,"v":{"a":0,"k":0.05,"ix":24}},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0025","nm":"Overlap random","ix":25,"v":{"a":0,"k":0,"ix":25}},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0026","nm":"","ix":26,"v":0},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0027","nm":"Soft Body (simulation)","ix":27,"v":0},{"ty":7,"mn":"Pseudo/Duik Kleaner v3.2-0028","nm":"Soft Body","ix":28,"v":{"a":0,"k":1,"ix":28}},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0029","nm":"Soft-Body Flexibility","ix":29,"v":{"a":0,"k":100,"ix":29}},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0030","nm":"","ix":30,"v":0},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0031","nm":"","ix":31,"v":0},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0032","nm":"Precision","ix":32,"v":{"a":0,"k":1,"ix":32}}]}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 1","ix":1,"cix":2,"np":2,"it":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 1","ix":1,"cix":2,"np":1,"it":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 1","ix":1,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[7.276,5.296],[0,-5.879],[16.087,0],[4.807,3.499],[-10.208,0],[0,16.088]],"o":[[2.996,4.578],[0,16.088],[-6.4,0],[5.202,7.948],[16.088,0],[0,-9.687]],"v":[[17.105,7.586],[21.857,23.506],[-7.271,52.635],[-24.377,47.047],[0,60.257],[29.129,31.128]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.8706,0.8745,0.9843],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 2","ix":2,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[0,-16.087],[16.087,0],[0,16.087],[-16.087,0]],"o":[[0,16.087],[-16.087,0],[0,-16.087],[16.087,0]],"v":[[29.129,31.128],[0,60.257],[-29.129,31.128],[0,1.999]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9529,0.9451,0.9882],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 6","ix":2,"cix":2,"np":1,"it":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 2","ix":1,"cix":2,"np":6,"it":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 1","ix":1,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[1.539,9.116],[0,0],[-9.441,-7.589],[0,0]],"o":[[0,0],[1.7,12.569],[0,0],[-6.706,-5.808]],"v":[[-38.429,37.63],[-47.902,37.63],[-30.251,68.836],[-25.492,60.595]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.3137,0.6784,0.7451],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 2","ix":2,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[-1.7,12.57],[0,0],[6.707,-5.809],[0,0]],"o":[[0,0],[-1.539,9.116],[0,0],[9.443,-7.589]],"v":[[47.902,37.63],[38.428,37.63],[25.49,60.597],[30.248,68.838]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.3137,0.6784,0.7451],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 3","ix":3,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[-6.66,5.602],[0,0],[1.959,-12.297],[0,0]],"o":[[0,0],[-9.394,7.374],[0,0],[1.761,-8.853]],"v":[[-25.069,1.275],[-29.799,-6.919],[-47.731,23.506],[-38.257,23.506]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.3137,0.6784,0.7451],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 4","ix":4,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[4.681,0],[4.162,1.518],[0,0],[-6.389,0],[-5.589,2.259],[0,0]],"o":[[-4.681,0],[0,0],[5.588,2.259],[6.389,0],[0,0],[-4.162,1.518]],"v":[[-0.002,70.141],[-13.315,67.752],[-18.068,75.984],[-0.002,79.517],[18.065,75.984],[13.312,67.753]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.3137,0.6784,0.7451],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 5","ix":5,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[-4.481,0],[-4.01,-1.396],[0,0],[6.189,0],[5.444,-2.127],[0,0]],"o":[[4.481,0],[0,0],[-5.445,-2.126],[-6.188,0],[0,0],[4.01,-1.397]],"v":[[-0.002,-7.885],[12.778,-5.692],[17.531,-13.924],[-0.002,-17.261],[-17.534,-13.924],[-12.782,-5.692]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.3137,0.6784,0.7451],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 6","ix":6,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[-1.761,-8.854],[0,0],[9.396,7.374],[0,0]],"o":[[0,0],[-1.959,-12.298],[0,0],[6.661,5.602]],"v":[[38.257,23.506],[47.731,23.506],[29.797,-6.92],[25.066,1.274]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.3137,0.6784,0.7451],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"tr","a":{"a":0,"k":[0,31.128],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,31.128],"ix":2},"r":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[0],"t":10},{"s":[300],"t":75}],"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 3","ix":3,"cix":2,"np":1,"it":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 1","ix":1,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[0,20.391],[14.952,11.601],[12.999,0],[12.807,-2.208],[0,-20.393],[-14.958,-11.601],[-25.616,4.418]],"o":[[0,-20.39],[-12.808,-2.211],[-13.003,0],[-14.954,11.601],[0,20.395],[25.614,4.414],[14.953,-11.601]],"v":[[63.417,31.146],[38.804,-18.938],[0.003,-22.291],[-38.798,-18.942],[-63.417,31.146],[-38.793,81.238],[38.802,81.232]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.4118,0.7882,0.8588],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 4","ix":4,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[0,16.088],[2.996,4.578],[6.401,0],[0,-16.087],[-2.996,-4.578],[-6.4,0]],"o":[[0,-5.879],[-4.806,-3.499],[-16.087,0],[0,5.879],[4.807,3.499],[16.087,0]],"v":[[21.857,23.506],[17.105,7.586],[0,1.999],[-29.128,31.128],[-24.377,47.047],[-7.271,52.635]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9529,0.9451,0.9882],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 5","ix":5,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[-16.087,0],[-4.806,-3.499],[10.208,0],[0,-16.087],[-7.276,-5.296],[0,5.879]],"o":[[6.401,0],[-5.201,-7.948],[-16.088,0],[0,9.687],[-2.996,-4.578],[0,-16.087]],"v":[[0,1.999],[17.105,7.586],[-7.271,-5.623],[-36.4,23.506],[-24.377,47.047],[-29.128,31.128]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9529,0.9451,0.9882],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":1},{"ty":4,"nm":"Layer 2","sr":1,"st":0,"op":100,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[0,31.146,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,3,100],"t":5},{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,100,100],"t":10},{"o":{"x":0.167,"y":0},"i":{"x":0.085,"y":1},"s":[100,100,100],"t":65},{"s":[100,3,100],"t":70}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[250,281.146,0],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2","nm":"Kleaner","ix":1,"en":1,"ef":[{"ty":7,"mn":"Pseudo/Duik Kleaner v3.2-0001","nm":"Anticipation","ix":1,"v":{"a":0,"k":0,"ix":1}},{"ty":7,"mn":"Pseudo/Duik Kleaner v3.2-0002","nm":"Smart Interpolation","ix":2,"v":{"a":0,"k":0,"ix":2}},{"ty":7,"mn":"Pseudo/Duik Kleaner v3.2-0003","nm":"Follow Through","ix":3,"v":{"a":0,"k":1,"ix":3}},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0004","nm":"Anticipation","ix":4,"v":0},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0005","nm":"Duration (s)","ix":5,"v":{"a":0,"k":0.3,"ix":5}},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0006","nm":"Amplitude","ix":6,"v":{"a":0,"k":50,"ix":6}},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0007","nm":"","ix":7,"v":0},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0008","nm":"Interpolation","ix":8,"v":0},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0009","nm":"Slow In","ix":9,"v":{"a":0,"k":60,"ix":9}},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0010","nm":"Slow Out","ix":10,"v":{"a":0,"k":25,"ix":10}},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0011","nm":"","ix":11,"v":0},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0012","nm":"Follow Through","ix":12,"v":0},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0013","nm":"Elasticity","ix":13,"v":{"a":0,"k":10,"ix":13}},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0014","nm":"Elasticity random","ix":14,"v":{"a":0,"k":0,"ix":14}},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0015","nm":"Damping","ix":15,"v":{"a":0,"k":50,"ix":15}},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0016","nm":"Damping random","ix":16,"v":{"a":0,"k":0,"ix":16}},{"ty":7,"mn":"Pseudo/Duik Kleaner v3.2-0017","nm":"Bounce","ix":17,"v":{"a":0,"k":0,"ix":17}},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0018","nm":"","ix":18,"v":0},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0019","nm":"Spatial Options","ix":19,"v":0},{"ty":7,"mn":"Pseudo/Duik Kleaner v3.2-0020","nm":"Smart Interpolation","ix":20,"v":{"a":0,"k":0,"ix":20}},{"ty":7,"mn":"Pseudo/Duik Kleaner v3.2-0021","nm":"Mode","ix":21,"v":{"a":0,"k":1,"ix":21}},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0022","nm":"Overlap (simulation)","ix":22,"v":0},{"ty":7,"mn":"Pseudo/Duik Kleaner v3.2-0023","nm":"Overlap","ix":23,"v":{"a":0,"k":1,"ix":23}},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0024","nm":"Delay (s)","ix":24,"v":{"a":0,"k":0.05,"ix":24}},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0025","nm":"Overlap random","ix":25,"v":{"a":0,"k":0,"ix":25}},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0026","nm":"","ix":26,"v":0},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0027","nm":"Soft Body (simulation)","ix":27,"v":0},{"ty":7,"mn":"Pseudo/Duik Kleaner v3.2-0028","nm":"Soft Body","ix":28,"v":{"a":0,"k":1,"ix":28}},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0029","nm":"Soft-Body Flexibility","ix":29,"v":{"a":0,"k":100,"ix":29}},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0030","nm":"","ix":30,"v":0},{"ty":6,"mn":"Pseudo/Duik Kleaner v3.2-0031","nm":"","ix":31,"v":0},{"ty":0,"mn":"Pseudo/Duik Kleaner v3.2-0032","nm":"Precision","ix":32,"v":{"a":0,"k":1,"ix":32}}]}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 1","ix":1,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[15.846,-4.881],[-16.389,-2.696]],"o":[[17.258,-0.775],[-13.368,-6.706]],"v":[[-28.621,-28.072],[21.349,-26.915]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[1,1,1],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 2","ix":2,"cix":2,"np":1,"it":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 1","ix":1,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[-1.132,-0.906],[-77.286,61.807],[4.934,3.945],[6.46,4.061],[108.324,50.329]],"o":[[77.246,61.809],[4.934,-3.945],[-6.014,-4.808],[-35.472,20.354],[0.612,1.094]],"v":[[-135.89,38.226],[135.887,38.229],[135.886,24.073],[117.133,10.816],[-138.475,35.187]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9529,0.9451,0.9882],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 3","ix":3,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[4.934,3.945],[48.621,0],[38.606,-30.892],[-4.929,-3.944],[-77.286,61.807]],"o":[[-38.64,-30.891],[-48.663,0],[-4.928,3.944],[77.246,61.809],[4.934,-3.945]],"v":[[135.886,24.073],[0.003,-22.291],[-135.891,24.075],[-135.89,38.225],[135.887,38.229]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9725,0.9765,0.9961],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 4","ix":4,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[5.131,4.961],[50.561,0],[40.146,-38.851],[-5.126,-4.96],[-80.369,77.731]],"o":[[-40.182,-38.85],[-50.605,0],[-5.125,4.96],[80.328,77.734],[5.131,-4.962]],"v":[[141.308,22.251],[0.003,-36.059],[-141.312,22.253],[-141.311,40.049],[141.309,40.054]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9216,0.7137,0.0235],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":2},{"ty":4,"nm":"Layer 1","sr":1,"st":0,"op":100,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[0,0,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[250,250,0],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 1","ix":1,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[5.131,5.981],[50.561,0],[40.146,-46.843],[-5.126,-5.981],[-80.369,93.72]],"o":[[-40.182,-46.841],[-50.605,0],[-5.125,5.981],[80.328,93.724],[5.131,-5.982]],"v":[[141.308,20.421],[0.003,-49.883],[-141.312,20.424],[-141.311,41.881],[141.309,41.886]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9686,0.8235,0.3294],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 2","ix":2,"cix":2,"np":8,"it":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 1","ix":1,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[1.336,-1.064],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[-1.936,-1.05]],"v":[[-148.076,-31.364],[-77.301,7.018],[-90.013,25.626],[-86.296,28.79],[-71.421,7.018],[-142.934,-31.764]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9216,0.7137,0.0235],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 2","ix":2,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[0,0],[1.592,-1.274],[-0.015,-0.013],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[-2.026,-1.673],[0.016,0.013],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[-116.241,-68.646],[-122.169,-68.673],[-122.12,-68.646],[-59.384,-16.861],[-74.864,-1.597],[-72.278,1.651],[-55.017,-15.37],[-56.23,-19.111]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9216,0.7137,0.0235],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 3","ix":3,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[2.078,-1.565],[-0.322,-0.56],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0.422,0.356],[0,0],[0,0],[0,0],[0,0],[0,0],[-1.673,-2.909]],"v":[[-72.626,-97.925],[-71.486,-96.587],[-30.876,-25.99],[-49.849,-17.565],[-49.109,-15.283],[-24.997,-25.99],[-65.607,-96.587]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9216,0.7137,0.0235],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 4","ix":4,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[5.019,-2.721],[0,0],[2.669,-2.272],[0,0],[0,0],[0,0]],"o":[[0,0],[2.125,1.692],[0,0],[0,0],[0,0],[4.347,-3.7]],"v":[[142.934,-31.764],[142.197,-31.365],[142.401,-23.968],[84.135,25.626],[86.296,28.79],[148.28,-23.968]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9216,0.7137,0.0235],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 5","ix":5,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[1.919,-2.41],[0,0],[0,0],[0,0],[4.397,-3.554]],"o":[[0,0],[0,0],[0,0],[3.543,-4.449],[1.866,1.493]],"v":[[117.104,-62.021],[68.985,-1.597],[72.278,1.651],[122.983,-62.021],[116.289,-68.673]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9216,0.7137,0.0235],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 6","ix":6,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[0,0],[0,0],[0,0],[0,0],[3.309,-2.794],[0.726,-2.238],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[1.562,-4.816],[1.457,1.097],[0,0],[0,0],[0,0]],"v":[[49.137,-15.37],[47.626,-16.861],[50.351,-19.111],[74.246,-92.751],[66.748,-97.925],[68.367,-92.751],[43.97,-17.565],[49.109,-15.283]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9216,0.7137,0.0235],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 7","ix":7,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[2.628,-1.991],[-0.156,-1.489],[0,0],[0,0],[0,0]],"o":[[0.934,0.708],[0,0],[0,0],[0,0],[-0.438,-4.188]],"v":[[-2.939,-111.189],[-1.153,-107.917],[7.311,-26.915],[13.191,-26.915],[4.727,-107.917]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9216,0.7137,0.0235],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 8","ix":8,"cix":2,"np":7,"it":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 1","ix":1,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[-4.347,-3.7],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[-5.017,-2.721]],"v":[[-148.28,-23.968],[-86.296,28.79],[-71.421,7.018],[-142.934,-31.764]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9686,0.8235,0.3294],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 2","ix":2,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[-3.557,-4.466],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[-4.402,-3.634]],"v":[[-122.983,-62.021],[-72.278,1.651],[-53.505,-16.861],[-116.241,-68.646]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9686,0.8235,0.3294],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 3","ix":3,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[-1.762,-5.43],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[-2.846,-4.948]],"v":[[-74.246,-92.751],[-49.109,-15.283],[-24.997,-25.99],[-65.607,-96.587]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9686,0.8235,0.3294],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 4","ix":4,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[5.019,-2.721],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[4.347,-3.7]],"v":[[142.934,-31.764],[71.422,7.018],[86.296,28.79],[148.28,-23.968]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9686,0.8235,0.3294],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 5","ix":5,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[0,0],[4.402,-3.634],[0,0],[0,0]],"o":[[3.556,-4.466],[0,0],[0,0],[0,0]],"v":[[122.983,-62.021],[116.241,-68.646],[53.505,-16.861],[72.278,1.651]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9686,0.8235,0.3294],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 6","ix":6,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[2.846,-4.948],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[1.761,-5.43]],"v":[[65.607,-96.587],[24.997,-25.99],[49.109,-15.283],[74.246,-92.751]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9686,0.8235,0.3294],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 7","ix":7,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[0.593,-5.678],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[-0.593,-5.678]],"v":[[-4.726,-107.917],[-13.19,-26.915],[13.191,-26.915],[4.727,-107.917]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9686,0.8235,0.3294],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":3}],"v":"5.7.11","fr":25,"op":79,"ip":0,"assets":[]}';
const piebarchartLottie = '{"nm":"___c","ddd":0,"h":1080,"w":1200,"meta":{"g":"@lottiefiles/toolkit-js 0.26.1"},"layers":[{"ty":0,"nm":"Comp 4","sr":1,"st":0,"op":253,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[960,540,0],"ix":1},"s":{"a":0,"k":[125,125,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[600,540,0],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[],"w":1920,"h":1080,"refId":"comp_24","ind":1}],"v":"5.1.3","fr":30,"op":253,"ip":0,"assets":[{"nm":"","id":"comp_24","layers":[{"ty":0,"nm":"infogr seamless 2","sr":1,"st":0,"op":253,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[960,540,0],"ix":1},"s":{"a":0,"k":[199.259,199.259,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[748,688,0],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[],"w":1920,"h":1080,"refId":"comp_25","ind":1}]},{"nm":"","id":"comp_25","layers":[{"ty":4,"nm":"vert line","sr":1,"st":-11,"op":253,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[101,-46.5,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[0,0,100],"t":179},{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,100,100],"t":190},{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,100,100],"t":246},{"s":[0,100,100],"t":252}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[1061,493.5,0],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Overshoot","ix":1,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":10,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Bounce","ix":2,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Friction","ix":3,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Shape 1","ix":1,"cix":2,"np":3,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":false,"i":[[0,-8],[0,0]],"o":[[0,37],[0,0]],"v":[[101,-183],[101,90]]},"ix":2}},{"ty":"st","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Stroke","nm":"Stroke 1","lc":1,"lj":1,"ml":4,"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":5,"ix":5},"c":{"a":0,"k":[0,0,0],"ix":3}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":1},{"ty":4,"nm":"line 5","sr":1,"st":175,"op":253,"ip":175,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[-40,71,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[920,611,0],"t":185,"ti":[0,0,0],"to":[0,0,0]},{"s":[920,587,0],"t":199}],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Overshoot","ix":1,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":10,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Bounce","ix":2,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Friction","ix":3,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Shape 1","ix":1,"cix":2,"np":3,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.24,"y":1},"s":[{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-40,71],[258.5,71]]}],"t":185},{"o":{"x":0.167,"y":0},"i":{"x":0.833,"y":1},"s":[{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-18,70.509],[216.5,70.509]]}],"t":202},{"o":{"x":0.167,"y":0},"i":{"x":0.833,"y":1},"s":[{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[33,70.21],[245.5,70.21]]}],"t":218},{"o":{"x":0.167,"y":0},"i":{"x":0.833,"y":1},"s":[{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[33,70.21],[245.5,70.21]]}],"t":230},{"s":[{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-29,70.47],[29.5,70.47]]}],"t":247}],"ix":2}},{"ty":"st","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Stroke","nm":"Stroke 1","lc":1,"lj":1,"ml":4,"o":{"a":0,"k":100,"ix":4},"w":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[5],"t":185},{"s":[44],"t":199}],"ix":5},"c":{"a":0,"k":[1,0.3098,0.6392],"ix":3}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":2},{"ty":4,"nm":"line 4","sr":1,"st":175,"op":248,"ip":175,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[-40,71,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[920,611,0],"t":182,"ti":[0,0,0],"to":[0,0,0]},{"s":[920,526,0],"t":196}],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Overshoot","ix":1,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":10,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Bounce","ix":2,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Friction","ix":3,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Shape 1","ix":1,"cix":2,"np":3,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.24,"y":1},"s":[{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-40,71],[258.5,71]]}],"t":183},{"o":{"x":0.167,"y":0},"i":{"x":0.833,"y":1},"s":[{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[27,70.743],[176.5,70.743]]}],"t":201},{"o":{"x":0.167,"y":0},"i":{"x":0.833,"y":1},"s":[{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-32,71.046],[188.5,71.046]]}],"t":214},{"o":{"x":0.167,"y":0},"i":{"x":0.833,"y":1},"s":[{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[99,71.163],[188.5,71.046]]}],"t":229},{"s":[{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[99,71.163],[101.5,71.282]]}],"t":250}],"ix":2}},{"ty":"st","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Stroke","nm":"Stroke 1","lc":1,"lj":1,"ml":4,"o":{"a":0,"k":100,"ix":4},"w":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[5],"t":182},{"s":[44],"t":196}],"ix":5},"c":{"a":0,"k":[0,0,0],"ix":3}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":3},{"ty":4,"nm":"line 3","sr":1,"st":175,"op":248,"ip":175,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[-40,71,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[920,611,0],"t":179,"ti":[0,0,0],"to":[0,0,0]},{"s":[920,466,0],"t":193}],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Overshoot","ix":1,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":10,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Bounce","ix":2,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Friction","ix":3,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Shape 1","ix":1,"cix":2,"np":3,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.15,"y":1},"s":[{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-40,71],[258.5,71]]}],"t":179},{"o":{"x":0.167,"y":0},"i":{"x":0.833,"y":1},"s":[{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[51,70.591],[241.5,70.773]]}],"t":196},{"o":{"x":0.167,"y":0},"i":{"x":0.833,"y":1},"s":[{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[16,70.645],[218.5,71.009]]}],"t":214},{"o":{"x":0.167,"y":0},"i":{"x":0.833,"y":1},"s":[{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[100,70.641],[218.5,71.009]]}],"t":229},{"s":[{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[100,70.641],[101.938,70.705]]}],"t":250}],"ix":2}},{"ty":"st","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Stroke","nm":"Stroke 1","lc":1,"lj":1,"ml":4,"o":{"a":0,"k":100,"ix":4},"w":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[5],"t":179},{"s":[44],"t":193}],"ix":5},"c":{"a":0,"k":[0.9647,0.898,0],"ix":3}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":4},{"ty":4,"nm":"line 2","sr":1,"st":175,"op":248,"ip":175,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[-40,71,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[920,611,0],"t":175,"ti":[0,0,0],"to":[0,0,0]},{"s":[920,406,0],"t":189}],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Overshoot","ix":1,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":10,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Bounce","ix":2,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Friction","ix":3,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Shape 1","ix":1,"cix":2,"np":3,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.15,"y":1},"s":[{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-40,71],[258.5,71]]}],"t":176},{"o":{"x":0.167,"y":0},"i":{"x":0.833,"y":1},"s":[{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-14,70.914],[201.5,70.914]]}],"t":194},{"o":{"x":0.167,"y":0},"i":{"x":0.833,"y":1},"s":[{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-14,70.914],[257.5,70.91]]}],"t":214},{"o":{"x":0.167,"y":0},"i":{"x":0.833,"y":1},"s":[{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[99,71.339],[257.5,70.91]]}],"t":229},{"s":[{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[99,71.339],[102.625,71.32]]}],"t":250}],"ix":2}},{"ty":"st","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Stroke","nm":"Stroke 1","lc":1,"lj":1,"ml":4,"o":{"a":0,"k":100,"ix":4},"w":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[5],"t":175},{"s":[44],"t":189}],"ix":5},"c":{"a":0,"k":[0.4118,0.7882,0.8588],"ix":3}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":5},{"ty":4,"nm":"mask2","sr":1,"st":-11,"op":243,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"td":1,"ao":0,"ks":{"a":{"a":0,"k":[88.5,103.5,0],"ix":1},"s":{"a":0,"k":[100,387.324,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[88.5,207.5,0],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Rectangle 1","ix":1,"cix":2,"np":3,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0]],"v":[[184.5,-35.5],[185,84.038],[-184,84.038],[-184.5,-35.5]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.1882,0.3725,0.5765],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[88.5,103.5],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":6,"parent":5},{"ty":0,"nm":"Pre-comp 3","sr":1,"st":-11,"op":243,"ip":0,"hd":false,"ddd":0,"bm":0,"tt":2,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[960,540,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[960,540,0],"t":174,"ti":[0,0,0],"to":[0,0,0]},{"s":[960,674,0],"t":189}],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[],"w":1920,"h":1080,"refId":"comp_26","ind":7},{"ty":4,"nm":"graph1","sr":1,"st":-11,"op":243,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[108.5,-95.5,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[1068.5,434.5,0],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Shape 1","ix":1,"cix":2,"np":3,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":false,"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[-29,-35.25],[2.5,-35.5],[33.5,-69],[70.5,-69],[110.5,-115.5],[143.5,-115.5],[182,-155.5],[246,-155.5]]},"ix":2}},{"ty":"st","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Stroke","nm":"Stroke 1","lc":1,"lj":1,"ml":4,"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":9,"ix":5},"c":{"a":0,"k":[1,0.3098,0.6392],"ix":3}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"tm","bm":0,"hd":false,"mn":"ADBE Vector Filter - Trim","nm":"Trim Paths 1","ix":2,"e":{"a":1,"k":[{"o":{"x":0.69,"y":0},"i":{"x":0.31,"y":1},"s":[0],"t":16},{"s":[100],"t":43}],"ix":2},"o":{"a":0,"k":0,"ix":3},"s":{"a":1,"k":[{"o":{"x":0.69,"y":0},"i":{"x":0.31,"y":1},"s":[0],"t":50},{"s":[100],"t":70}],"ix":1},"m":1}],"ind":8},{"ty":4,"nm":"line","sr":1,"st":-11,"op":176,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[-40,71,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.41,"y":1},"s":[0,100,100],"t":-11},{"o":{"x":0.59,"y":0},"i":{"x":0.833,"y":1},"s":[100,100,100],"t":24},{"o":{"x":0.167,"y":0},"i":{"x":0.833,"y":1},"s":[100,100,100],"t":88},{"o":{"x":0.164,"y":0},"i":{"x":0.833,"y":1},"s":[100,0,100],"t":95},{"o":{"x":0.164,"y":0},"i":{"x":0.698,"y":0.994},"s":[100,0,100],"t":133},{"o":{"x":0.167,"y":0.167},"i":{"x":0.26,"y":1},"s":[0,100,100],"t":134},{"s":[100,100,100],"t":158}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[920,611,0],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Shape 2","ix":1,"cix":2,"np":3,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":false,"i":[[0,0]],"o":[[0,0]],"v":[[348.5,-9]]},"ix":2}},{"ty":"st","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Stroke","nm":"Stroke 1","lc":1,"lj":1,"ml":4,"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":5,"ix":5},"c":{"a":0,"k":[0,0,0],"ix":3}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Shape 1","ix":2,"cix":2,"np":3,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-40,71],[258.5,71]]},"ix":2}},{"ty":"st","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Stroke","nm":"Stroke 1","lc":1,"lj":1,"ml":4,"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":5,"ix":5},"c":{"a":0,"k":[0,0,0],"ix":3}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":9},{"ty":4,"nm":"line 6","sr":1,"st":242,"op":253,"ip":247,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[-40,71,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.41,"y":1},"s":[0,100,100],"t":242},{"o":{"x":0.59,"y":0},"i":{"x":0.833,"y":1},"s":[100,100,100],"t":277},{"o":{"x":0.167,"y":0},"i":{"x":0.833,"y":1},"s":[100,100,100],"t":341},{"o":{"x":0.164,"y":0},"i":{"x":0.833,"y":1},"s":[100,0,100],"t":348},{"o":{"x":0.164,"y":0},"i":{"x":0.698,"y":0.994},"s":[100,0,100],"t":386},{"o":{"x":0.167,"y":0.167},"i":{"x":0.26,"y":1},"s":[0,100,100],"t":387},{"s":[100,100,100],"t":411}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[920,611,0],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Shape 2","ix":1,"cix":2,"np":3,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":false,"i":[[0,0]],"o":[[0,0]],"v":[[348.5,-9]]},"ix":2}},{"ty":"st","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Stroke","nm":"Stroke 1","lc":1,"lj":1,"ml":4,"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":5,"ix":5},"c":{"a":0,"k":[0,0,0],"ix":3}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Shape 1","ix":2,"cix":2,"np":3,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-40,71],[258.5,71]]},"ix":2}},{"ty":"st","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Stroke","nm":"Stroke 1","lc":1,"lj":1,"ml":4,"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":5,"ix":5},"c":{"a":0,"k":[0,0,0],"ix":3}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":10},{"ty":4,"nm":"bar5","sr":1,"st":242,"op":253,"ip":247,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[-3.158,38.756,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,0,100],"t":242},{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,64,100],"t":252},{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,64,100],"t":311},{"s":[100,0,100],"t":323}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[960,611.483,0],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Overshoot","ix":1,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":10,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Bounce","ix":2,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Friction","ix":3,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Rectangle 1","ix":1,"cix":2,"np":3,"it":[{"ty":"rc","bm":0,"hd":false,"mn":"ADBE Vector Shape - Rect","nm":"Rectangle Path 1","d":1,"p":{"a":0,"k":[0,0],"ix":3},"r":{"a":0,"k":0,"ix":4},"s":{"a":0,"k":[60.287,146.411],"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[1,0.3098,0.6392],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[-3.158,-34.45],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":11},{"ty":4,"nm":"bar8","sr":1,"st":242,"op":253,"ip":247,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[-3.158,38.756,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,0,100],"t":250},{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,87,100],"t":260},{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,87,100],"t":311},{"s":[100,0,100],"t":323}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.29,"y":1},"s":[960,611.483,0],"t":250,"ti":[-12,0,0],"to":[12,0,0]},{"s":[1032,611.483,0],"t":260}],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Overshoot","ix":1,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":10,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Bounce","ix":2,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Friction","ix":3,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Rectangle 1","ix":1,"cix":2,"np":3,"it":[{"ty":"rc","bm":0,"hd":false,"mn":"ADBE Vector Shape - Rect","nm":"Rectangle Path 1","d":1,"p":{"a":0,"k":[0,0],"ix":3},"r":{"a":0,"k":0,"ix":4},"s":{"a":0,"k":[60.287,146.411],"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0,0,0],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[-3.158,-34.45],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":12},{"ty":4,"nm":"bar7","sr":1,"st":242,"op":253,"ip":247,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[-3.158,38.756,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,0,100],"t":258},{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,117,100],"t":268},{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,117,100],"t":311},{"s":[100,0,100],"t":323}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.29,"y":1},"s":[1032,611.483,0],"t":258,"ti":[-12,0,0],"to":[12,0,0]},{"s":[1104,611.483,0],"t":268}],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Overshoot","ix":1,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":10,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Bounce","ix":2,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Friction","ix":3,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Rectangle 1","ix":1,"cix":2,"np":3,"it":[{"ty":"rc","bm":0,"hd":false,"mn":"ADBE Vector Shape - Rect","nm":"Rectangle Path 1","d":1,"p":{"a":0,"k":[0,0],"ix":3},"r":{"a":0,"k":0,"ix":4},"s":{"a":0,"k":[60.287,146.411],"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.2314,0.4392,0.6745],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[-3.158,-34.45],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":13},{"ty":4,"nm":"bar6","sr":1,"st":242,"op":253,"ip":247,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[-3.158,38.756,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,0,100],"t":266},{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,146,100],"t":276},{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,146,100],"t":311},{"s":[100,0,100],"t":323}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.29,"y":1},"s":[1104,611.483,0],"t":266,"ti":[-12,0,0],"to":[12,0,0]},{"s":[1176,611.483,0],"t":276}],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Overshoot","ix":1,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":10,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Bounce","ix":2,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Friction","ix":3,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Rectangle 1","ix":1,"cix":2,"np":3,"it":[{"ty":"rc","bm":0,"hd":false,"mn":"ADBE Vector Shape - Rect","nm":"Rectangle Path 1","d":1,"p":{"a":0,"k":[0,0],"ix":3},"r":{"a":0,"k":0,"ix":4},"s":{"a":0,"k":[60.287,146.411],"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.1882,0.3725,0.5765],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[-3.158,-34.45],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":14},{"ty":4,"nm":"bar4","sr":1,"st":-11,"op":70,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[-3.158,38.756,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,0,100],"t":-11},{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,64,100],"t":-1},{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,64,100],"t":58},{"s":[100,0,100],"t":70}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[960,611.483,0],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Overshoot","ix":1,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":10,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Bounce","ix":2,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Friction","ix":3,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Rectangle 1","ix":1,"cix":2,"np":3,"it":[{"ty":"rc","bm":0,"hd":false,"mn":"ADBE Vector Shape - Rect","nm":"Rectangle Path 1","d":1,"p":{"a":0,"k":[0,0],"ix":3},"r":{"a":0,"k":0,"ix":4},"s":{"a":0,"k":[60.287,146.411],"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[1,0.3098,0.6392],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[-3.158,-34.45],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":15},{"ty":4,"nm":"bar3","sr":1,"st":-11,"op":70,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[-3.158,38.756,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,0,100],"t":-3},{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,87,100],"t":7},{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,87,100],"t":58},{"s":[100,0,100],"t":70}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.29,"y":1},"s":[960,611.483,0],"t":-3,"ti":[-12,0,0],"to":[12,0,0]},{"s":[1032,611.483,0],"t":7}],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Overshoot","ix":1,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":10,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Bounce","ix":2,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Friction","ix":3,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Rectangle 1","ix":1,"cix":2,"np":3,"it":[{"ty":"rc","bm":0,"hd":false,"mn":"ADBE Vector Shape - Rect","nm":"Rectangle Path 1","d":1,"p":{"a":0,"k":[0,0],"ix":3},"r":{"a":0,"k":0,"ix":4},"s":{"a":0,"k":[60.287,146.411],"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0,0,0],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[-3.158,-34.45],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":16},{"ty":4,"nm":"bar2","sr":1,"st":-11,"op":70,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[-3.158,38.756,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,0,100],"t":5},{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,117,100],"t":15},{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,117,100],"t":58},{"s":[100,0,100],"t":70}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.29,"y":1},"s":[1032,611.483,0],"t":5,"ti":[-12,0,0],"to":[12,0,0]},{"s":[1104,611.483,0],"t":15}],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Overshoot","ix":1,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":10,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Bounce","ix":2,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Friction","ix":3,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Rectangle 1","ix":1,"cix":2,"np":3,"it":[{"ty":"rc","bm":0,"hd":false,"mn":"ADBE Vector Shape - Rect","nm":"Rectangle Path 1","d":1,"p":{"a":0,"k":[0,0],"ix":3},"r":{"a":0,"k":0,"ix":4},"s":{"a":0,"k":[60.287,146.411],"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9647,0.898,0],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[-3.158,-34.45],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":17},{"ty":4,"nm":"bar1","sr":1,"st":-11,"op":70,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[-3.158,38.756,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,0,100],"t":13},{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,146,100],"t":23},{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[100,146,100],"t":58},{"s":[100,0,100],"t":70}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.29,"y":1},"s":[1104,611.483,0],"t":13,"ti":[-12,0,0],"to":[12,0,0]},{"s":[1176,611.483,0],"t":23}],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Overshoot","ix":1,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":10,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Bounce","ix":2,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Friction","ix":3,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Rectangle 1","ix":1,"cix":2,"np":3,"it":[{"ty":"rc","bm":0,"hd":false,"mn":"ADBE Vector Shape - Rect","nm":"Rectangle Path 1","d":1,"p":{"a":0,"k":[0,0],"ix":3},"r":{"a":0,"k":0,"ix":4},"s":{"a":0,"k":[60.287,146.411],"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.4118,0.7882,0.8588],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[-3.158,-34.45],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":18},{"ty":0,"nm":"Pre-comp 2","sr":1,"st":70,"op":253,"ip":70,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[960,540,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[960,540,0],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[],"w":1920,"h":1080,"refId":"comp_27","ind":19}]},{"nm":"","id":"comp_26","layers":[{"ty":4,"nm":"dot 4","sr":1,"st":0,"op":300,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[345,-61,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[0,0,100],"t":139},{"s":[75,75,100],"t":154}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[1068.75,465,0],"t":150,"ti":[-19.5,10,0],"to":[19.5,-10,0]},{"s":[1185.75,405,0],"t":158}],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Overshoot","ix":1,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Bounce","ix":2,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Friction","ix":3,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Overshoot","ix":4,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":10,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Bounce","ix":5,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Friction","ix":6,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":60,"ix":1}}]}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Ellipse 1","ix":1,"cix":2,"np":3,"it":[{"ty":"el","bm":0,"hd":false,"mn":"ADBE Vector Shape - Ellipse","nm":"Ellipse Path 1","d":1,"p":{"a":0,"k":[0,0],"ix":3},"s":{"a":0,"k":[52,52],"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.4118,0.7882,0.8588],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[345,-61],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":1},{"ty":4,"nm":"dot 3","sr":1,"st":0,"op":300,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[345,-61,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[0,0,100],"t":136},{"s":[75,75,100],"t":151}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[1068.75,465,0],"t":147,"ti":[-6.16666650772095,-0.83333331346512,0],"to":[6.16666650772095,0.83333331346512,0]},{"s":[1105.75,470,0],"t":156}],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Overshoot","ix":1,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Bounce","ix":2,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Friction","ix":3,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Overshoot","ix":4,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":10,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Bounce","ix":5,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Friction","ix":6,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":60,"ix":1}}]}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Ellipse 1","ix":1,"cix":2,"np":3,"it":[{"ty":"el","bm":0,"hd":false,"mn":"ADBE Vector Shape - Ellipse","nm":"Ellipse Path 1","d":1,"p":{"a":0,"k":[0,0],"ix":3},"s":{"a":0,"k":[52,52],"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.9647,0.898,0],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[345,-61],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":2},{"ty":4,"nm":"dot 2","sr":1,"st":0,"op":300,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[345,-61,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[0,0,100],"t":134},{"s":[75,75,100],"t":149}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[1068.75,465,0],"t":144,"ti":[7.33333349227905,1.83333337306976,0],"to":[-7.33333349227905,-1.83333337306976,0]},{"s":[1024.75,454,0],"t":153}],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Overshoot","ix":1,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Bounce","ix":2,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Friction","ix":3,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Overshoot","ix":4,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":10,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Bounce","ix":5,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Friction","ix":6,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":60,"ix":1}}]}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Ellipse 1","ix":1,"cix":2,"np":3,"it":[{"ty":"el","bm":0,"hd":false,"mn":"ADBE Vector Shape - Ellipse","nm":"Ellipse Path 1","d":1,"p":{"a":0,"k":[0,0],"ix":3},"s":{"a":0,"k":[52,52],"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0,0,0],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[345,-61],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":3},{"ty":4,"nm":"dot","sr":1,"st":0,"op":300,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[345,-61,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[0,0,100],"t":132},{"s":[75,75,100],"t":147}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[1068.75,465,0],"t":141,"ti":[20.8333339691162,-8.16666698455811,0],"to":[-20.8333339691162,8.16666698455811,0]},{"s":[943.75,514,0],"t":150}],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Overshoot","ix":1,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Bounce","ix":2,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Scale - Friction","ix":3,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Overshoot","ix":4,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":10,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Bounce","ix":5,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Position - Friction","ix":6,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":60,"ix":1}}]}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Ellipse 1","ix":1,"cix":2,"np":3,"it":[{"ty":"el","bm":0,"hd":false,"mn":"ADBE Vector Shape - Ellipse","nm":"Ellipse Path 1","d":1,"p":{"a":0,"k":[0,0],"ix":3},"s":{"a":0,"k":[52,52],"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[1,0.3098,0.6392],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[345,-61],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":4},{"ty":4,"nm":"dash","sr":1,"st":0,"op":300,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":true,"ao":0,"ks":{"a":{"a":0,"k":[227,-135,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[1187,405,0],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[],"masksProperties":[{"nm":"Mask 1","inv":false,"mode":"s","x":{"a":0,"k":0,"ix":4},"o":{"a":0,"k":100,"ix":3},"pt":{"a":0,"k":{"c":true,"i":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],"v":[[-31,-161],[-31,-13.08],[66,-91.08],[150,-68.08],[227,-135],[236.706,-191.084]]},"ix":1}}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Shape 1","ix":1,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":false,"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[227,-135],[227,69]]},"ix":2}},{"ty":"st","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Stroke","nm":"Stroke 1","lc":1,"lj":1,"ml":4,"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":5,"ix":5},"d":[{"nm":"dash","n":"d","v":{"a":0,"k":10,"ix":1}},{"nm":"offset","n":"o","v":{"a":0,"k":-14,"ix":7}}],"c":{"a":0,"k":[0,0,0],"ix":3}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"tm","bm":0,"hd":false,"mn":"ADBE Vector Filter - Trim","nm":"Trim Paths 1","ix":2,"e":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.26,"y":1},"s":[0],"t":163},{"s":[98],"t":178}],"ix":2},"o":{"a":0,"k":0,"ix":3},"s":{"a":0,"k":0,"ix":1},"m":1},{"ty":"rp","bm":0,"hd":false,"mn":"ADBE Vector Filter - Repeater","nm":"Repeater 1","ix":3,"m":1,"c":{"a":0,"k":4,"ix":1},"o":{"a":0,"k":-3,"ix":2},"tr":{"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0},"p":{"a":0,"k":[81,0],"ix":2},"r":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0},"so":{"a":0,"k":100,"ix":5},"eo":{"a":0,"k":100,"ix":6}}}],"ind":5},{"ty":4,"nm":"graph2","sr":1,"st":0,"op":300,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[0,0,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[960,540,0],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Shape 1","ix":1,"cix":2,"np":3,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":false,"i":[[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0]],"v":[[-16,-25.5],[57.5,-87],[152.5,-70],[227,-136.5]]},"ix":2}},{"ty":"st","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Stroke","nm":"Stroke 1","lc":1,"lj":1,"ml":4,"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":9,"ix":5},"c":{"a":0,"k":[1,0.3098,0.6392],"ix":3}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[0,0],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"tm","bm":0,"hd":false,"mn":"ADBE Vector Filter - Trim","nm":"Trim Paths 1","ix":2,"e":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.26,"y":1},"s":[0],"t":148},{"s":[100],"t":176}],"ix":2},"o":{"a":0,"k":0,"ix":3},"s":{"a":0,"k":0,"ix":1},"m":1}],"ind":6}]},{"nm":"","id":"comp_27","layers":[{"ty":4,"nm":"pie chart4","sr":1,"st":-81,"op":219,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":true,"ao":0,"ks":{"a":{"a":0,"k":[109,69.5,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.15,"y":1},"s":[100,100,100],"t":54},{"s":[0,0,100],"t":95}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.31,"y":1},"s":[1069,609.5,0],"t":21,"ti":[0,24.1666660308838,0],"to":[0,-24.1666660308838,0]},{"s":[1069,464.5,0],"t":42}],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"ADBE Slider Control","nm":"Offset - Trim Paths 1 - Overshoot","ix":1,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Offset - Trim Paths 1 - Bounce","ix":2,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Offset - Trim Paths 1 - Friction","ix":3,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]}],"masksProperties":[{"nm":"Mask 1","inv":false,"mode":"a","x":{"a":0,"k":0,"ix":4},"o":{"a":0,"k":100,"ix":3},"pt":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.31,"y":1},"s":[{"c":true,"i":[[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0]],"v":[[-37,-81],[-37,71],[256,71],[256,-81]]}],"t":21},{"s":[{"c":true,"i":[[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0]],"v":[[-37,-81],[-36.583,225.959],[256.417,225.959],[256,-81]]}],"t":42}],"ix":1}}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Ellipse 1","ix":1,"cix":2,"np":3,"it":[{"ty":"el","bm":0,"hd":false,"mn":"ADBE Vector Shape - Ellipse","nm":"Ellipse Path 1","d":1,"p":{"a":0,"k":[0,0],"ix":3},"s":{"a":0,"k":[119,119],"ix":2}},{"ty":"st","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Stroke","nm":"Stroke 1","lc":1,"lj":1,"ml":4,"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":119,"ix":5},"c":{"a":0,"k":[1,0.3098,0.6392],"ix":3}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[113.278,113.278],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[109,69.5],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"tm","bm":0,"hd":false,"mn":"ADBE Vector Filter - Trim","nm":"Trim Paths 1","ix":2,"e":{"a":0,"k":66,"ix":2},"o":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[0],"t":17},{"s":[28],"t":41}],"ix":3},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.31,"y":1},"s":[75],"t":0},{"o":{"x":0.69,"y":0},"i":{"x":0.833,"y":1},"s":[80],"t":17},{"s":[88],"t":41}],"ix":1},"m":1}],"ind":1},{"ty":4,"nm":"pie chart3","sr":1,"st":-81,"op":219,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":true,"ao":0,"ks":{"a":{"a":0,"k":[109,69.5,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.15,"y":1},"s":[100,100,100],"t":54},{"s":[0,0,100],"t":95}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.31,"y":1},"s":[1069,609.5,0],"t":21,"ti":[0,24.1666660308838,0],"to":[0,-24.1666660308838,0]},{"s":[1069,464.5,0],"t":42}],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"ADBE Slider Control","nm":"Offset - Trim Paths 1 - Overshoot","ix":1,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Offset - Trim Paths 1 - Bounce","ix":2,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Offset - Trim Paths 1 - Friction","ix":3,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]}],"masksProperties":[{"nm":"Mask 1","inv":false,"mode":"a","x":{"a":0,"k":0,"ix":4},"o":{"a":0,"k":100,"ix":3},"pt":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.31,"y":1},"s":[{"c":true,"i":[[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0]],"v":[[-37,-81],[-37,71],[256,71],[256,-81]]}],"t":21},{"s":[{"c":true,"i":[[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0]],"v":[[-37,-81],[-36.583,222.292],[256.417,222.292],[256,-81]]}],"t":42}],"ix":1}}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Ellipse 1","ix":1,"cix":2,"np":3,"it":[{"ty":"el","bm":0,"hd":false,"mn":"ADBE Vector Shape - Ellipse","nm":"Ellipse Path 1","d":1,"p":{"a":0,"k":[0,0],"ix":3},"s":{"a":0,"k":[119,119],"ix":2}},{"ty":"st","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Stroke","nm":"Stroke 1","lc":1,"lj":1,"ml":4,"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":119,"ix":5},"c":{"a":0,"k":[0,0,0],"ix":3}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[113.278,113.278],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[109,69.5],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"tm","bm":0,"hd":false,"mn":"ADBE Vector Filter - Trim","nm":"Trim Paths 1","ix":2,"e":{"a":0,"k":66,"ix":2},"o":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[0],"t":17},{"s":[30],"t":41}],"ix":3},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.31,"y":1},"s":[25],"t":0},{"o":{"x":0.69,"y":0},"i":{"x":0.833,"y":1},"s":[13],"t":17},{"s":[37],"t":41}],"ix":1},"m":1}],"ind":2},{"ty":4,"nm":"pie chart2","sr":1,"st":-81,"op":219,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":true,"ao":0,"ks":{"a":{"a":0,"k":[109,69.5,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.15,"y":1},"s":[100,100,100],"t":54},{"s":[0,0,100],"t":95}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.31,"y":1},"s":[1069,609.5,0],"t":21,"ti":[0,24.1666660308838,0],"to":[0,-24.1666660308838,0]},{"s":[1069,464.5,0],"t":42}],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"ADBE Slider Control","nm":"Offset - Trim Paths 1 - Overshoot","ix":1,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Offset - Trim Paths 1 - Bounce","ix":2,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Offset - Trim Paths 1 - Friction","ix":3,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]}],"masksProperties":[{"nm":"Mask 1","inv":false,"mode":"a","x":{"a":0,"k":0,"ix":4},"o":{"a":0,"k":100,"ix":3},"pt":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.31,"y":1},"s":[{"c":true,"i":[[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0]],"v":[[-37,-81],[-37,71],[256,71],[256,-81]]}],"t":21},{"s":[{"c":true,"i":[[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0]],"v":[[-37,-81],[-36.292,213.289],[256.708,213.289],[256,-81]]}],"t":42}],"ix":1}}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Ellipse 1","ix":1,"cix":2,"np":3,"it":[{"ty":"el","bm":0,"hd":false,"mn":"ADBE Vector Shape - Ellipse","nm":"Ellipse Path 1","d":1,"p":{"a":0,"k":[0,0],"ix":3},"s":{"a":0,"k":[119,119],"ix":2}},{"ty":"st","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Stroke","nm":"Stroke 1","lc":1,"lj":1,"ml":4,"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":119,"ix":5},"c":{"a":0,"k":[0.9647,0.898,0],"ix":3}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[113.278,113.278],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[109,69.5],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"tm","bm":0,"hd":false,"mn":"ADBE Vector Filter - Trim","nm":"Trim Paths 1","ix":2,"e":{"a":0,"k":66,"ix":2},"o":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[0],"t":17},{"s":[30],"t":41}],"ix":3},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.31,"y":1},"s":[75],"t":0},{"o":{"x":0.167,"y":0},"i":{"x":0.833,"y":1},"s":[100],"t":20},{"s":[100],"t":41}],"ix":1},"m":1}],"ind":3},{"ty":4,"nm":"pie chart1","sr":1,"st":-81,"op":219,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":true,"ao":0,"ks":{"a":{"a":0,"k":[109,69.5,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.15,"y":1},"s":[100,100,100],"t":54},{"s":[0,0,100],"t":95}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.31,"y":1},"s":[1069,609.5,0],"t":21,"ti":[0,24.1666660308838,0],"to":[0,-24.1666660308838,0]},{"s":[1069,464.5,0],"t":42}],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[{"ty":0,"mn":"ADBE Slider Control","nm":"Offset - Trim Paths 1 - Overshoot","ix":1,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":20,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Offset - Trim Paths 1 - Bounce","ix":2,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]},{"ty":0,"mn":"ADBE Slider Control","nm":"Offset - Trim Paths 1 - Friction","ix":3,"en":1,"ef":[{"ty":0,"mn":"ADBE Slider Control-0001","nm":"Slider","ix":1,"v":{"a":0,"k":40,"ix":1}}]}],"masksProperties":[{"nm":"Mask 1","inv":false,"mode":"a","x":{"a":0,"k":0,"ix":4},"o":{"a":0,"k":100,"ix":3},"pt":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.31,"y":1},"s":[{"c":true,"i":[[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0]],"v":[[-37,-81],[-37,71],[256,71],[256,-81]]}],"t":21},{"s":[{"c":true,"i":[[0,0],[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0],[0,0]],"v":[[-37,-81],[-36.292,213.289],[256.708,213.289],[256,-81]]}],"t":42}],"ix":1}}],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Ellipse 1","ix":1,"cix":2,"np":3,"it":[{"ty":"el","bm":0,"hd":false,"mn":"ADBE Vector Shape - Ellipse","nm":"Ellipse Path 1","d":1,"p":{"a":0,"k":[0,0],"ix":3},"s":{"a":0,"k":[119,119],"ix":2}},{"ty":"st","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Stroke","nm":"Stroke 1","lc":1,"lj":1,"ml":4,"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":119,"ix":5},"c":{"a":0,"k":[0.4118,0.7882,0.8588],"ix":3}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[113.278,113.278],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[109,69.5],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]},{"ty":"tm","bm":0,"hd":false,"mn":"ADBE Vector Filter - Trim","nm":"Trim Paths 1","ix":2,"e":{"a":0,"k":66,"ix":2},"o":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.833,"y":0.833},"s":[0],"t":17},{"s":[29],"t":41}],"ix":3},"s":{"a":1,"k":[{"o":{"x":0.167,"y":0.167},"i":{"x":0.31,"y":1},"s":[25],"t":0},{"o":{"x":0.167,"y":0},"i":{"x":0.833,"y":1},"s":[0],"t":20},{"s":[0],"t":41}],"ix":1},"m":1}],"ind":4}]}]}';

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;
	let { checkmark } = $$props;
	let { content_tag_1 } = $$props;
	let { content_tag_2 } = $$props;
	let { content_image_1 } = $$props;
	let { content_image_2 } = $$props;
	let { content_title_1 } = $$props;
	let { content_title_2 } = $$props;
	let { content_action_1 } = $$props;
	let { content_action_2 } = $$props;
	let { content_description_1a } = $$props;
	let { content_description_1b } = $$props;
	let { content_description_2a } = $$props;
	let { content_description_2b } = $$props;
	let { content_description_2c } = $$props;
	let { content_description_2d } = $$props;

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(15, props = $$props.props);
		if ('checkmark' in $$props) $$invalidate(0, checkmark = $$props.checkmark);
		if ('content_tag_1' in $$props) $$invalidate(1, content_tag_1 = $$props.content_tag_1);
		if ('content_tag_2' in $$props) $$invalidate(2, content_tag_2 = $$props.content_tag_2);
		if ('content_image_1' in $$props) $$invalidate(3, content_image_1 = $$props.content_image_1);
		if ('content_image_2' in $$props) $$invalidate(4, content_image_2 = $$props.content_image_2);
		if ('content_title_1' in $$props) $$invalidate(5, content_title_1 = $$props.content_title_1);
		if ('content_title_2' in $$props) $$invalidate(6, content_title_2 = $$props.content_title_2);
		if ('content_action_1' in $$props) $$invalidate(7, content_action_1 = $$props.content_action_1);
		if ('content_action_2' in $$props) $$invalidate(8, content_action_2 = $$props.content_action_2);
		if ('content_description_1a' in $$props) $$invalidate(9, content_description_1a = $$props.content_description_1a);
		if ('content_description_1b' in $$props) $$invalidate(10, content_description_1b = $$props.content_description_1b);
		if ('content_description_2a' in $$props) $$invalidate(11, content_description_2a = $$props.content_description_2a);
		if ('content_description_2b' in $$props) $$invalidate(12, content_description_2b = $$props.content_description_2b);
		if ('content_description_2c' in $$props) $$invalidate(13, content_description_2c = $$props.content_description_2c);
		if ('content_description_2d' in $$props) $$invalidate(14, content_description_2d = $$props.content_description_2d);
	};

	return [
		checkmark,
		content_tag_1,
		content_tag_2,
		content_image_1,
		content_image_2,
		content_title_1,
		content_title_2,
		content_action_1,
		content_action_2,
		content_description_1a,
		content_description_1b,
		content_description_2a,
		content_description_2b,
		content_description_2c,
		content_description_2d,
		props
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance, create_fragment, safe_not_equal, {
			props: 15,
			checkmark: 0,
			content_tag_1: 1,
			content_tag_2: 2,
			content_image_1: 3,
			content_image_2: 4,
			content_title_1: 5,
			content_title_2: 6,
			content_action_1: 7,
			content_action_2: 8,
			content_description_1a: 9,
			content_description_1b: 10,
			content_description_2a: 11,
			content_description_2b: 12,
			content_description_2c: 13,
			content_description_2d: 14
		});
	}
}

export { Component as default };
