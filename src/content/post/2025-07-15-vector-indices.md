---
slug: "vector-indices"
title: "Vector Indices Explained Through the FES Theorem"
description: "Explains the Foundation of HNSW Indices"
pubDate: "July 15 2025"
heroImage: "/img/vector-indices/fez-wiki.jpg"
categories: ["release"]
authors: ["semih"]
tags: ["vector indices", "hnsw"]
---
[Vectors](), which are high-dimensional embeddings of objects, such as text documents or images,
are used in a wide range of modern LLM-based/agentic applications.
[Vector indices](), which allow quickly finding a set of vectors that are similar to each other 
are becoming a core part of many modern data systems.
Since [version 0.9.0](https://blog.kuzudb.com/post/kuzu-0.9.0-release/),
Kuzu also ships with its own native vector index. 
Our design 
allows users to do arbitrary hybrid graph and vector search, a capability
many applications need to bring context and precision
to their vector retrievals.
Soon, my [amazing student Gaurav]() and I will write about Kuzu's vector index
design, which is based on an upcoming [VLDB 2025 paper]().
Today, as a precursor to that post, I will write about
the foundations of the *[hierarchical navigable small worlds]()* (HNSW) design
for vector indices. This is the design that Kuzu's index, as well as,
most modern vector indices in practice. 

This post is based on several lectures from a [graduate course]() that I gave last fall at University of Waterloo.
My goal is to explain HNSW indices as an evolution of two other earlier vector 
indices, [k-d trees]() and [sa-trees](). 
There are three core ideas behind HNSW indices: 

<ol type="i">
  <li>kNN search algorithm;</li>
  <li>connecting pairs of close vectors with each other in the index; and</li>
  <li>pruning neighbors of vectors.</li>
</ol>

As I will explain, these ideas exist in k-d trees and sa-trees.
That is why, I find that covering k-d trees and sa-trees
before HNSW makes the core ideas behind HNSW quite intuitive.

<figure style="float: right; width: 200px; margin: 0 0 1em 1em;">
  <img src="/img/vector-indices/fez-wiki.png" alt="Alt text" style="width: 100%;" />
  <figcaption style="text-align: center; font-size: 0.9em;">
    A fes (in English fez). 
  </figcaption>
</figure>

To help position the capabilities of these three indices, I will also use a 
framework that I refer to as the "*FES theorem*"[^1], which is the observation
that any vector index can provide at most two of the following three properties:
(i) **F**ast search; (ii) **E**xact results, i.e., returns exactly the 
correct most similar vectors to query vectors; and (iii) **S**calability, i.e., support
for high-dimensional vectors. As I will show, these three indices capture
each possible 2 combinations of these three properties. The below table summarizes
the properties of these indices:

| Index     | F | E | S |  
|-----|---|----|----|
| k-d trees | ✔ | ✔ | X | 
| s-a trees | X | ✔ | ✔ |   
| HNSW      | ✔ | X | ✔✔ |

You'll notice that my choice of the term "FES theorem" intentionally echoes the
the famous [CAP 
theorem](https://en.wikipedia.org/wiki/CAP_theorem) of distributed systems that "states
that any distributed data store can provide at most two of the following three guarantees: 
**C**onsistency, **A**vailability, **P**artition tolerance." Some of you will also notice
that just like cap, fes (Turkish) or [fez](https://en.wikipedia.org/wiki/Fez_(hat)) (English) is a type of headdress. Now you see why I had to pick the term.[^2] 

[^1]: It's likely people from computational geometry have some vocabulary to explain
this phenomenon but I couldn't find it in my quick seach. If you know of some writing
that coins a similar term to explain this
phenomenon about existing vector indices, let me know.

[^2]: In touristic parts of Turkiye, you'll find icecream sellers with a fez doing 
tricks to tourists to entertain them. Here's a [video](https://www.youtube.com/watch?v=AnJ5BCMCZGw) from Istanbul.

### High-level Problem: Vector Search
The high-level search problem vector/spatial indices solve is the following.
We are given as input:

(i) a set of vectors $V$, which are points in some space (2D, 3D, or 1000 dimensional);
and 

(ii) a *query vector* $q$ in the same space.

The goal is to find vectors in $V$ that are close to $q$. There are several variants of the problem, 
such as finding the $k$-nearest neighbors (k-NN query) of $q$
or finding all points that is within a radius $r$ of $q$ (range query).
The problem is quite hard, especially when the input vectors have high dimensions because
of a geometric phenomenon known as the [curse of dimensionality](https://en.wikipedia.org/wiki/Curse_of_dimensionality#Distance_function),
which is that in high-dimensional spaces pairs of vectors seem to have similar distances. 
In other words, every pair of vector seems to be equally far from each other.[^3] 
To make the matters worse computing distances, say the L2 or cosine distance,
of two high-dimensional vectors is expensive. So the goal is that given $q$, 
the index should  *explore*, i.e., compute distances, to as few vectors in $V$ as possible
to answer the k-NN or range query.

[^3]: This is analogous to the [cosmic homogeneity phenomenon](https://en.wikipedia.org/wiki/Cosmological_principle)
in astronomy, which states that at large enough scales, matter looks homogeneously distributed in the universe.

We will focus 
on k-NN queries in this post but exactly the same ideas are used to answer range queries.
As in any index, such as a B+ tree index, the goal of a vector index is 
to organize the vectors in some data structure so that answering these 

### K-d Trees
K-d trees are balanced trees that organize vectors by recursively dividing the 
high-dimensional space into two equal-sized parts along one of the dimensions.
Let's suppose we have the following 2D vectors on the left.

<Img src="/img/vector-indices/kd-tree.png" alt="Example set of 2D vectors and k-d-tree" />

We first split along one dimension, say x dimension. That is, we sort the vectors according to their
x-axis values and then find the median vector.
In our example, the median x value is 5 (the thick red line), so the point (5,3) is picked. 
We put all points with x-value $\le 5$ to the left  partition, and all vectors with x-value $> 5$ to the right.
Then we recursively take the left and right partitions one at a time and 
split each one into two further equal partitions so that the tree remains balanced. Although
not strictly necessary, the common wisdom is to switch the dimensions in a round robin
fashion when picking the next set of median vectors. The ultimate goal is to recursively
split the vectors equally along some dimension. In our example, we would then split the left partition 
using the (2, 2) vector (so along the y=2 line) and the right partition
using the (9, 5) vector (so along the y=5 line). The final k-d tree that we construct is
shown on the right above.


The kNN search algorithm is a simple brute-force algorithm with a simple
heuristic. We are given a query vector $\texttt{q}$ and a value $\texttt{k}$. I'm also assuming
that there is a function $\texttt{dist}$ that we can use to compute the distance of two vectors.
Let $\texttt{T}$ be the kd-tree. Here's the pseudocode of the algorithm.

```javascript
kNNSearch(q, k):
  // results store (v, d) pairs, where v is an "explored" vector whose distance to q is d.
  results = max priority queue 
  // candidates store (c, lb) pairs, where c is a candidate vector whose distance to q
  // has not yet been explored and lb is a lower bound on the distance of q to every 
  // node in the subtree rooted at c (including c). 
  candidates = min priority queue
  entry = T.root
  candidates.put(entry, lb=0)
  while (!candidates.empty()):
    // get the next candidate vector, i.e., one that is closest to
    (c, lb) = candidates.popMin()
    if (results.size() < k or lb < results.peekMax().d):
      // explore the candidate c
      dist_q_c = dist(q, c)
      if (results.size() < k):
        results.put((c, dist_q_c))
      else if (dist_q_c < results.peekMax().d):
        results.popMax()
        results.put((c, dist_q_c))
      // add left and right children to candidates
      for (child in c.children):
        // assume splitting dimension of candidate c is x; similar computation
        // would be done if the splitting dimension is another dimension.
        child_lb = 0
        if (child is the left child): 
          child_lb = c.x < q.x ? q.x - c.x : 0
        else:
          child_lb = c.x > q.x ? c.x - q.x : 0
        candidates.put(child, child_lb)
```
I am calling this a brute-force algorithm because I can summarize 
it as follows: *starting from the root,  
search the entire k-d tree, except if a sub-tree rooted 
at node $\texttt{c}$ cannot contain any vectors that
can be in the k nearest neighbor of $\texttt{q}$, then just skip it*.
As we do this brute-force search simply keep a running *k nearest neighbors seen so far* (results priority queue).
The way to compute a lower bound is ... skips $\texttt{c}$ is by computing a lower bound 
of 

because you know that you cannot find any vectors there
that can improve the best k results you alre


### S-a Trees
Note that this is one of the best papers you have read in this literature. Unfortunately, it's
not very practical but as a research project, I rank this top-class. 

### HNSW Indices

---
