// Content Image Left 2 - Personal - Updated June 3, 2024
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
	let div4;
	let div3;
	let div2;
	let img;
	let img_src_value;
	let img_alt_value;
	let t0;
	let div1;
	let lottie_player;
	let lottie_player_src_value;
	let t1;
	let div0;
	let a;
	let t2_value = /*content_action*/ ctx[1].label + "";
	let t2;
	let a_href_value;

	return {
		c() {
			div4 = element("div");
			div3 = element("div");
			div2 = element("div");
			img = element("img");
			t0 = space();
			div1 = element("div");
			lottie_player = element("lottie-player");
			t1 = space();
			div0 = element("div");
			a = element("a");
			t2 = text(t2_value);
			this.h();
		},
		l(nodes) {
			div4 = claim_element(nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			div3 = claim_element(div4_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			img = claim_element(div2_nodes, "IMG", { class: true, src: true, alt: true });
			t0 = claim_space(div2_nodes);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);

			lottie_player = claim_element(div1_nodes, "LOTTIE-PLAYER", {
				autoplay: true,
				loop: true,
				mode: true,
				class: true,
				src: true
			});

			children(lottie_player).forEach(detach);
			t1 = claim_space(div1_nodes);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			a = claim_element(div0_nodes, "A", { href: true, class: true });
			var a_nodes = children(a);
			t2 = claim_text(a_nodes, t2_value);
			a_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(img, "class", "content-image svelte-x50bhh");
			if (!src_url_equal(img.src, img_src_value = /*content_image*/ ctx[0].url)) attr(img, "src", img_src_value);
			attr(img, "alt", img_alt_value = /*content_image*/ ctx[0].alt);
			set_custom_element_data(lottie_player, "autoplay", "");
			set_custom_element_data(lottie_player, "loop", "");
			set_custom_element_data(lottie_player, "mode", "normal");
			set_custom_element_data(lottie_player, "class", "lottie svelte-x50bhh");
			if (!src_url_equal(lottie_player.src, lottie_player_src_value = eyesLottie)) set_custom_element_data(lottie_player, "src", lottie_player_src_value);
			attr(a, "href", a_href_value = /*content_action*/ ctx[1].url);
			attr(a, "class", "primary-small-button svelte-x50bhh");
			attr(div0, "class", "button-wrapper svelte-x50bhh");
			attr(div1, "class", "content-2 svelte-x50bhh");
			attr(div2, "class", "section-container content svelte-x50bhh");
			attr(div3, "class", "wrapper svelte-x50bhh");
			attr(div4, "class", "container svelte-x50bhh");
		},
		m(target, anchor) {
			insert_hydration(target, div4, anchor);
			append_hydration(div4, div3);
			append_hydration(div3, div2);
			append_hydration(div2, img);
			append_hydration(div2, t0);
			append_hydration(div2, div1);
			append_hydration(div1, lottie_player);
			append_hydration(div1, t1);
			append_hydration(div1, div0);
			append_hydration(div0, a);
			append_hydration(a, t2);
		},
		p(ctx, [dirty]) {
			if (dirty & /*content_image*/ 1 && !src_url_equal(img.src, img_src_value = /*content_image*/ ctx[0].url)) {
				attr(img, "src", img_src_value);
			}

			if (dirty & /*content_image*/ 1 && img_alt_value !== (img_alt_value = /*content_image*/ ctx[0].alt)) {
				attr(img, "alt", img_alt_value);
			}

			if (dirty & /*content_action*/ 2 && t2_value !== (t2_value = /*content_action*/ ctx[1].label + "")) set_data(t2, t2_value);

			if (dirty & /*content_action*/ 2 && a_href_value !== (a_href_value = /*content_action*/ ctx[1].url)) {
				attr(a, "href", a_href_value);
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(div4);
		}
	};
}

const eyesLottie = '{"nm":"Vector shape animation 51","ddd":0,"h":1080,"w":1080,"meta":{"g":"@lottiefiles/toolkit-js 0.26.1"},"layers":[{"ty":3,"nm":"Null 6","sr":1,"st":0,"op":3892.00015852441,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[0,0,0],"ix":1},"s":{"a":0,"k":[140,140,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[540,540,0],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":0,"ix":11}},"ef":[],"ind":1},{"ty":3,"nm":"Null 5","sr":1,"st":0,"op":3892.00015852441,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[0,0,0],"ix":1},"s":{"a":0,"k":[30,30,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[-205.714,0,0],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":0,"ix":11}},"ef":[],"ind":2,"parent":1},{"ty":3,"nm":"Null 4","sr":1,"st":0,"op":3892.00015852441,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[0,0,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,106,100],"t":0},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,7,100],"t":20},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,106,100],"t":30},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,106,100],"t":35},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,7,100],"t":38},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,106,100],"t":41},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,106,100],"t":50.708},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,7,100],"t":52.464},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,106,100],"t":54.22},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,106,100],"t":57.146},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,7,100],"t":63},{"o":{"x":0.167,"y":0},"i":{"x":0.34,"y":1},"s":[100,106,100],"t":74.708},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,106,100],"t":83},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,7,100],"t":99},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,106,100],"t":109},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,106,100],"t":114},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,7,100],"t":117},{"s":[100,106,100],"t":120.0000048877}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[0,0,0],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":0,"ix":11}},"ef":[],"ind":3,"parent":2},{"ty":3,"nm":"Null 4","sr":1,"st":0,"op":3892.00015852441,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[0,0,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,99,100],"t":0},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,0,100],"t":20},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,99,100],"t":30},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,99,100],"t":35},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,0,100],"t":38},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,99,100],"t":41},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,99,100],"t":50.708},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,0,100],"t":52.464},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,99,100],"t":54.22},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,99,100],"t":57.146},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,0,100],"t":63},{"o":{"x":0.167,"y":0},"i":{"x":0.34,"y":1},"s":[100,99,100],"t":74.708},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,99,100],"t":83},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,0,100],"t":99},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,99,100],"t":109},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,99,100],"t":114},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,0,100],"t":117},{"s":[100,99,100],"t":120.0000048877}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[0,0,0],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":0,"ix":11}},"ef":[],"ind":4,"parent":2},{"ty":4,"nm":"Layer 11 - Group 2 - Group 4","sr":1,"st":0,"op":3892.00015852441,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"td":1,"ao":0,"ks":{"a":{"a":0,"k":[572.231,514.88,0],"ix":1},"s":{"a":0,"k":[1216.019,1216.019,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[0,0,0],"ix":2},"r":{"a":0,"k":45,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 3","ix":1,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[0,0],[0,0],[33.304,0],[0,0],[0,0],[-33.304,0]],"o":[[0,0],[0,33.304],[0,0],[0,0],[0,-33.304],[0,0]],"v":[[30.151,-30.151],[30.151,-30.151],[-30.151,30.151],[-30.151,30.151],[-30.151,30.151],[30.151,-30.151]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.1373,0.749,0.8588],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[572.231,514.88],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":5,"parent":4},{"ty":4,"nm":"Layer 11 - Group 2 - Group 1","sr":1,"st":0,"op":3892.00015852441,"ip":0,"hd":false,"ddd":0,"bm":0,"tt":1,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[570.781,516.246,0],"ix":1},"s":{"a":0,"k":[1216.019,1216.019,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":1,"k":[{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[0,0,0],"t":0,"ti":[0,0,0],"to":[0,0,0]},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[200,0,0],"t":30,"ti":[0,0,0],"to":[0,0,0]},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[-206.667,40,0],"t":60,"ti":[0,0,0],"to":[0,0,0]},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[140,0,0],"t":90,"ti":[0,0,0],"to":[0,0,0]},{"s":[0,0,0],"t":120.0000048877}],"ix":2},"r":{"a":0,"k":45,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 1","ix":1,"cix":2,"np":2,"it":[{"ty":"el","bm":0,"hd":false,"mn":"ADBE Vector Shape - Ellipse","nm":"Ellipse Path 1","d":1,"p":{"a":0,"k":[0,0],"ix":3},"s":{"a":0,"k":[21.569,21.569],"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.1176,0,0.3451],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[570.781,516.246],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":6,"parent":2},{"ty":4,"nm":"Layer 11 - Group 2 - Group 3","sr":1,"st":0,"op":3892.00015852441,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[572.231,514.88,0],"ix":1},"s":{"a":0,"k":[1216.019,1216.019,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[0,0,0],"ix":2},"r":{"a":0,"k":45,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 3","ix":1,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[0,0],[0,0],[33.304,0],[0,0],[0,0],[-33.304,0]],"o":[[0,0],[0,33.304],[0,0],[0,0],[0,-33.304],[0,0]],"v":[[30.151,-30.151],[30.151,-30.151],[-30.151,30.151],[-30.151,30.151],[-30.151,30.151],[30.151,-30.151]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.2824,0.8471,0.949],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[572.231,514.88],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":7,"parent":4},{"ty":4,"nm":"Layer 11 - Group 2 - Group 5","sr":1,"st":0,"op":3892.00015852441,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[572.231,514.88,0],"ix":1},"s":{"a":0,"k":[1216.019,1216.019,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[0,0,0],"ix":2},"r":{"a":0,"k":45,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 3","ix":1,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[0,0],[0,0],[33.304,0],[0,0],[0,0],[-33.304,0]],"o":[[0,0],[0,33.304],[0,0],[0,0],[0,-33.304],[0,0]],"v":[[30.151,-30.151],[30.151,-30.151],[-30.151,30.151],[-30.151,30.151],[-30.151,30.151],[30.151,-30.151]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0,0,0],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[572.231,514.88],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":8,"parent":3},{"ty":3,"nm":"Null 5","sr":1,"st":0,"op":3892.00015852441,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[0,0,0],"ix":1},"s":{"a":0,"k":[30,30,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[205.714,0,0],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":0,"ix":11}},"ef":[],"ind":9,"parent":1},{"ty":3,"nm":"Null 4","sr":1,"st":0,"op":3892.00015852441,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[0,0,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,106,100],"t":0},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,7,100],"t":20},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,106,100],"t":30},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,106,100],"t":35},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,7,100],"t":38},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,106,100],"t":41},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,106,100],"t":50.708},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,7,100],"t":52.464},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,106,100],"t":54.22},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,106,100],"t":57.146},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,7,100],"t":63},{"o":{"x":0.167,"y":0},"i":{"x":0.34,"y":1},"s":[100,106,100],"t":74.708},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,106,100],"t":83},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,7,100],"t":99},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,106,100],"t":109},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,106,100],"t":114},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,7,100],"t":117},{"s":[100,106,100],"t":120.0000048877}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[0,0,0],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":0,"ix":11}},"ef":[],"ind":10,"parent":9},{"ty":3,"nm":"Null 4","sr":1,"st":0,"op":3892.00015852441,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[0,0,0],"ix":1},"s":{"a":1,"k":[{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,99,100],"t":0},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,0,100],"t":20},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,99,100],"t":30},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,99,100],"t":35},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,0,100],"t":38},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,99,100],"t":41},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,99,100],"t":50.708},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,0,100],"t":52.464},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,99,100],"t":54.22},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,99,100],"t":57.146},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,0,100],"t":63},{"o":{"x":0.167,"y":0},"i":{"x":0.34,"y":1},"s":[100,99,100],"t":74.708},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,99,100],"t":83},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,0,100],"t":99},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,99,100],"t":109},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,99,100],"t":114},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[100,0,100],"t":117},{"s":[100,99,100],"t":120.0000048877}],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[0,0,0],"ix":2},"r":{"a":0,"k":0,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":0,"ix":11}},"ef":[],"ind":11,"parent":9},{"ty":4,"nm":"Layer 11 - Group 2 - Group 9","sr":1,"st":0,"op":3892.00015852441,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"td":1,"ao":0,"ks":{"a":{"a":0,"k":[572.231,514.88,0],"ix":1},"s":{"a":0,"k":[1216.019,1216.019,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[0,0,0],"ix":2},"r":{"a":0,"k":45,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 3","ix":1,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[0,0],[0,0],[33.304,0],[0,0],[0,0],[-33.304,0]],"o":[[0,0],[0,33.304],[0,0],[0,0],[0,-33.304],[0,0]],"v":[[30.151,-30.151],[30.151,-30.151],[-30.151,30.151],[-30.151,30.151],[-30.151,30.151],[30.151,-30.151]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.1373,0.749,0.8588],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[572.231,514.88],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":12,"parent":11},{"ty":4,"nm":"Layer 11 - Group 2 - Group 8","sr":1,"st":0,"op":3892.00015852441,"ip":0,"hd":false,"ddd":0,"bm":0,"tt":1,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[570.781,516.246,0],"ix":1},"s":{"a":0,"k":[1216.019,1216.019,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":1,"k":[{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[0,0,0],"t":0,"ti":[0,0,0],"to":[0,0,0]},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[200,0,0],"t":30,"ti":[0,0,0],"to":[0,0,0]},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[-206.667,40,0],"t":60,"ti":[0,0,0],"to":[0,0,0]},{"o":{"x":0.66,"y":0},"i":{"x":0.34,"y":1},"s":[140,0,0],"t":90,"ti":[0,0,0],"to":[0,0,0]},{"s":[0,0,0],"t":120.0000048877}],"ix":2},"r":{"a":0,"k":45,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 1","ix":1,"cix":2,"np":2,"it":[{"ty":"el","bm":0,"hd":false,"mn":"ADBE Vector Shape - Ellipse","nm":"Ellipse Path 1","d":1,"p":{"a":0,"k":[0,0],"ix":3},"s":{"a":0,"k":[21.569,21.569],"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.1176,0,0.3451],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[570.781,516.246],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":13,"parent":9},{"ty":4,"nm":"Layer 11 - Group 2 - Group 7","sr":1,"st":0,"op":3892.00015852441,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[572.231,514.88,0],"ix":1},"s":{"a":0,"k":[1216.019,1216.019,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[0,0,0],"ix":2},"r":{"a":0,"k":45,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 3","ix":1,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[0,0],[0,0],[33.304,0],[0,0],[0,0],[-33.304,0]],"o":[[0,0],[0,33.304],[0,0],[0,0],[0,-33.304],[0,0]],"v":[[30.151,-30.151],[30.151,-30.151],[-30.151,30.151],[-30.151,30.151],[-30.151,30.151],[30.151,-30.151]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0.2824,0.8471,0.949],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[572.231,514.88],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":14,"parent":11},{"ty":4,"nm":"Layer 11 - Group 2 - Group 6","sr":1,"st":0,"op":3892.00015852441,"ip":0,"hd":false,"ddd":0,"bm":0,"hasMask":false,"ao":0,"ks":{"a":{"a":0,"k":[572.231,514.88,0],"ix":1},"s":{"a":0,"k":[1216.019,1216.019,100],"ix":6},"sk":{"a":0,"k":0},"p":{"a":0,"k":[0,0,0],"ix":2},"r":{"a":0,"k":45,"ix":10},"sa":{"a":0,"k":0},"o":{"a":0,"k":100,"ix":11}},"ef":[],"shapes":[{"ty":"gr","bm":0,"hd":false,"mn":"ADBE Vector Group","nm":"Group 3","ix":1,"cix":2,"np":2,"it":[{"ty":"sh","bm":0,"hd":false,"mn":"ADBE Vector Shape - Group","nm":"Path 1","ix":1,"d":1,"ks":{"a":0,"k":{"c":true,"i":[[0,0],[0,0],[33.304,0],[0,0],[0,0],[-33.304,0]],"o":[[0,0],[0,33.304],[0,0],[0,0],[0,-33.304],[0,0]],"v":[[30.151,-30.151],[30.151,-30.151],[-30.151,30.151],[-30.151,30.151],[-30.151,30.151],[30.151,-30.151]]},"ix":2}},{"ty":"fl","bm":0,"hd":false,"mn":"ADBE Vector Graphic - Fill","nm":"Fill 1","c":{"a":0,"k":[0,0,0],"ix":4},"r":1,"o":{"a":0,"k":100,"ix":5}},{"ty":"tr","a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"sk":{"a":0,"k":0,"ix":4},"p":{"a":0,"k":[572.231,514.88],"ix":2},"r":{"a":0,"k":0,"ix":6},"sa":{"a":0,"k":0,"ix":5},"o":{"a":0,"k":100,"ix":7}}]}],"ind":15,"parent":10}],"v":"5.10.1","fr":29.9700012207031,"op":121.000004928431,"ip":0,"assets":[]}';

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;
	let { content } = $$props;
	let { content_image } = $$props;
	let { content_title } = $$props;
	let { content_action } = $$props;

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(2, props = $$props.props);
		if ('content' in $$props) $$invalidate(3, content = $$props.content);
		if ('content_image' in $$props) $$invalidate(0, content_image = $$props.content_image);
		if ('content_title' in $$props) $$invalidate(4, content_title = $$props.content_title);
		if ('content_action' in $$props) $$invalidate(1, content_action = $$props.content_action);
	};

	return [content_image, content_action, props, content, content_title];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance, create_fragment, safe_not_equal, {
			props: 2,
			content: 3,
			content_image: 0,
			content_title: 4,
			content_action: 1
		});
	}
}

export { Component as default };
