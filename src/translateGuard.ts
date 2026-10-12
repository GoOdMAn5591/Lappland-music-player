/**
 * Browser page translation (Chrome's "Translate this page", translation
 * extensions) swaps the page's text nodes for <font> wrappers behind React's
 * back. The next time React updates that text it can't find the node it
 * created and throws ("insertBefore … not a child of this node"), which
 * unmounts the whole app: a black page. Friends who open an invite link with
 * auto-translate on hit this the moment they take a seat.
 *
 * This is the long-standing community workaround (facebook/react#11538):
 * ignore removals/insertions against nodes that are no longer where React left
 * them. Translated text may then lag behind, but the bar keeps running.
 */
export function guardAgainstPageTranslation() {
  if (typeof Node !== "function" || !Node.prototype) return;
  const proto = Node.prototype as Node & { __tavernGuard?: boolean };
  if (proto.__tavernGuard) return;
  proto.__tavernGuard = true;
  const removeChild = proto.removeChild;
  proto.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child) as T;
  };
  const insertBefore = proto.insertBefore;
  proto.insertBefore = function <T extends Node>(
    this: Node,
    node: T,
    reference: Node | null,
  ): T {
    if (reference && reference.parentNode !== this)
      return this.appendChild(node) as T;
    return insertBefore.call(this, node, reference) as T;
  };
}
