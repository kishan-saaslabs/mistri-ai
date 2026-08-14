import assert from "node:assert/strict";
import { test } from "node:test";
import { MockClient } from "../llm/mockClient.js";
import { contextualizeQuery } from "./contextualize.js";

test("first turn of a conversation is never rewritten", async () => {
  const client = new MockClient("should not be used");
  const result = await contextualizeQuery([], "What were the objections on this call?", client);
  assert.equal(client.calls.length, 0);
  assert.equal(result.isFollowup, false);
  assert.equal(result.standaloneQuery, "What were the objections on this call?");
});

test("a long, self-contained follow-up with no dependence signal skips the rewrite", async () => {
  const client = new MockClient("should not be used");
  const history = [{ role: "user" as const, content: "What are the risks on this deal?" }];
  const result = await contextualizeQuery(
    history,
    "Did the customer mention anything about their renewal timeline or budget approval process?",
    client,
  );
  assert.equal(client.calls.length, 0);
  assert.equal(result.isFollowup, false);
});

test("a short topic-name query with no dependence signal skips the rewrite regardless of word count", async () => {
  // Confirmed live: a word-count gate ("skip rewrite only if > N words") was
  // tried twice (>6, then >3) and broke both times on short, fully
  // self-contained messages — "Can you summarize this call?" and "About
  // Land CCK" were both force-routed into a rewrite purely for being brief,
  // and the rewrite hijacked them using unrelated prior history. Length is
  // not the signal; the presence of a dependence marker is — this message
  // has none, so it must pass through untouched no matter how short it is.
  const client = new MockClient("should not be used");
  const history = [
    { role: "user" as const, content: "What calls do I have access to?" },
    { role: "assistant" as const, content: "You have access to several calls." },
  ];
  const result = await contextualizeQuery(history, "About Land CCK", client);
  assert.equal(client.calls.length, 0, "must not call the rewrite model at all");
  assert.equal(result.standaloneQuery, "About Land CCK");
  assert.equal(result.isFollowup, false);
});

test("'this call'/'that deal' are scope self-references, not dependence signals — no rewrite even with prior history", async () => {
  // Confirmed live: without this exclusion, "this" in "this call" was
  // flagged as needing history to resolve, and the rewrite model then
  // hijacked the question into whatever the previous turn had been about
  // — a real, observed failure, not a hypothetical.
  const client = new MockClient("should not be used");
  const history = [
    { role: "user" as const, content: "What were the objections on this call?" },
    { role: "assistant" as const, content: "None recorded." },
  ];
  const result = await contextualizeQuery(history, "Can you summarize this call?", client);
  assert.equal(client.calls.length, 0, "must not call the rewrite model at all");
  assert.equal(result.standaloneQuery, "Can you summarize this call?");
  assert.equal(result.isFollowup, false);
});

test("an elliptical follow-up with a dependence signal triggers a rewrite", async () => {
  const client = new MockClient("How serious is the risk that Northwind has no confirmed decision maker?");
  const history = [
    { role: "user" as const, content: "What are the risks on the Northwind deal?" },
    { role: "assistant" as const, content: "Two risks: competitor evaluation, no confirmed decision maker." },
  ];
  const result = await contextualizeQuery(history, "How serious is the second one?", client);
  assert.equal(client.calls.length, 1);
  assert.equal(result.isFollowup, true);
  assert.match(result.standaloneQuery, /decision maker/);
});

test("a rewrite that invents a company name absent from the conversation is rejected", async () => {
  const client = new MockClient("How serious is the risk that Brightline hasn't confirmed budget?");
  const history = [
    { role: "user" as const, content: "What are the risks on the Northwind deal?" },
    { role: "assistant" as const, content: "No confirmed decision maker." },
  ];
  const result = await contextualizeQuery(history, "How serious is it?", client);
  assert.equal(result.standaloneQuery, "How serious is it?", "must fall back to the original message");
});
