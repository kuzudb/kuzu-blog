---
slug: "entity-resolved-knowledge-graphs"
title:  "From data to insights: Entity-resolved knowledge graphs with Kuzu & Senzing"
description: "Walkthrough of using Kuzu with Senzing, an entity resolution engine, to combine data from Open Ownership and OpenSanctions to uncover financial crimes"
pubDate: "June 10 2025"
heroImage: "/img/creating-high-quality-knowledge-graphs/er-banner.png"
categories: ["example"]
authors: ["prashanth", {"name": "Paco Nathan", "image": "/img/authors/paco-xander-nathan-e1713802414444-150x150.png", "bio": "Principal DevRel Engineer at Senzing"}]
tags: ["entity-resolution", "senzing", "high-quality"]
draft: false
---

Investigative graph analyses involve using a variety of graph queries and network analysis techniques to uncover
patterns, relationships, and insights within complex data represented as a graph.
They are commonly used in domains like social networks, finance, cybersecurity,
and biology to discover useful relationships and structures within the data.
However, a common challenge faced by developers of these applications is in creating **high quality** knowledge graphs
for downstream tasks. 

Let's start by defining what we mean by "high quality" in the context of knowledge graphs.
When working with data from multiple sources, the same entity may be
represented by different names, aliases, or other identifiers in each source, leading to duplicate
entities (i.e., nodes) in the graph. This can lead to incorrect or incomplete analysis results, which
can be a significant barrier to graph adoption in sensitive domains like the ones mentioned above.

_Entity resolution_ is the process of determining when real-world entities are the same, despite differences in how
they are described, or inconsistencies in how the data was entered[^1]. To help solve this problem, [Senzing](https://senzing.com/senzing-sdk/) provides
a real-time entity resolution SDK that developers can use to resolve entities with relationship-awareness in
their graph applications.

Let's look at an example of using Kuzu with Senzing on a real-world dataset used to uncover financial crimes.
If you're interested in learning how to use a fast and easy-to-use graph database to manage your
entity-resolved knowledge graphs, keep reading on!

## Data sources

The dataset used in this blog post includes examples of bad-actor tradecraft
in the financial domain, such as money laundering, tax evasion, money mules, shell companies, and more.

The data is sourced from two providers:

- [OpenSanctions](https://www.opensanctions.org/): Provides the "risk" category of sanctions targets and persons of interest
who are known to be associated with financial crimes.
- [OpenOwnership](https://www.openownership.org/): Provides data about the ultimate beneficial ownership details, linking entities in the data.
A "beneficial owner" is a natural person or persons who ultimately owns or controls an interest in a legal entity or arrangement,
such as a company, a trust, or a foundation.

<Img src="/img/creating-high-quality-knowledge-graphs/kgc-er-1.png" width=600 alt="Open Ownership and OpenSanctions data schema">

The term "Entity" can refer to a person or company, and the goal of entity resolution is to match like-for-like entities between the two data sources.
Because the full dataset from these providers is rather large, we'll only be using _slices_ of data in this example.
Rest assured, the methodology discussed below will scale well even with _much_ larger amounts of data.

The data from Open Ownership and OpenSanctions is acquired in the form of line-delimited JSON files, and an example record from each
file (for the person named Abassin Badshah) is shown below. The data consists of some fields that are common to both sources (such as
names, addresses, dates of birth, relationships, etc.), but others that are unique to each source.

<Img src="/img/creating-high-quality-knowledge-graphs/kgc-er-2.png" alt="Example data records from OpenOwnership and OpenSanctions">

## Senzing pipeline

This section walks through the sequence of steps in a typical entity resolution workflow using the Senzing Python SDK.
The first step is to pass the two input files to the Senzing engine, which will produce a resolved version
of the data that maps like-for-like entities between the two sources.

We'll first launch the Senzing engine in a Docker container, and use its Python SDK to generate the entity-resolved
data for the Open Ownership and OpenSanctions datasets. This section walks through the sequence of steps
in a typical entity resolution workflow using the Senzing Python SDK.

```bash
docker run -it --rm --volume ./data:/tmp/data senzing/demo-senzing
```

Launching via this command utilizes the Senzing API's base layer in Docker, and also includes a set of
Python utilities which source from the [this public repo](https://github.com/senzing-garage/) on GitHub.
These utilities are located in the `/opt/senzing/g2/python` directory within the container.

We'll run the Senzing configuration tool to create a namespace for the two JSON files (from Open Ownership and OpenSanctions)
which we'll load later:
```bash
G2ConfigTool.py
>>> addDataSource OPEN-SANCTIONS
>>> addDataSource OPEN-OWNERSHIP
>>> save
save changes? (y/n)
>>> y
>>> exit
```
Each input file has a `DATA_SOURCE` field (as shown below) that specifies the source of the data, which tells the Senzing
engine what namespace to load the data into.

```json
{
    "DATA_SOURCE": "OPEN-OWNERSHIP",
    ...
}
```

Next, we can load the two files from the local machine into the running Docker container:
```bash
G2Loader.py -f ./data/open-sanctions.json
G2Loader.py -f ./data/open-ownership.json
```

Once loaded, Senzing processes the records on-the-fly, i.e., it can process multiple records in parallel
and all temporary files generated during the entity resolution process are stored in the running Docker
container's volume. Once the two files have been loaded, we obtain a "resolved" version of the data
that contains a unique Senzing entity ID for each entity in the dataset.

The resolved data can be exported to a JSON file that we can access locally, using the `G2Export.py` tool:

```bash
G2Export.py -F JSON -o ./data/export.json
```

How is this data used to create a high-quality knowledge graph? The entity resolution workflow from Senzing produces an "overlay"
subgraph that connects like-for-like entities between the two sources. The two otherwise disjoint subgraphs
(from Open Ownership and OpenSanctions) are brought together to create a _single graph_ with edges
between the entities when they represent the same real-world entity.

<Img src="/img/creating-high-quality-knowledge-graphs/kgc-er-3.png" width=600 alt="Senzing entity resolution output">

This is the entity resolution workflow in a nutshell! We're now ready to preprocess all the data for ingestion into Kuzu.

## Kuzu pipeline

### Data transformations

Because the data from each source can be quite large in practice, it's important to think about performance and scalability
of the data transformation steps for ingestion into Kuzu.
[Polars](https://docs.pola.rs/user-guide/getting-started/) is an open-source library for data manipulation,
known for being one of the fastest data processing solutions for Python on a single machine. It comes with a
rich [expressions API](https://docs.pola.rs/user-guide/expressions/) that allows for complex queries, being human-readable while also
allowing the underlying Polars query engine to optimize the query plan for performance. Let's look at
an example of this in action, using Open Ownership data.

```py
import polars as pl

# Read newline-delimited JSON files
df = pl.read_ndjson("data/open-ownership.json")

# First, explode ATTRIBUTES for all records
df = df.explode("NAMES").explode("ATTRIBUTES")

# Extract nationality from person or organization
# Uses a Polars when-then-otherwise expression
df = df.with_columns(
    pl.when(pl.col("RECORD_TYPE") == "PERSON")
    .then(pl.col("ATTRIBUTES").struct.field("NATIONALITY"))
    .when(pl.col("RECORD_TYPE") == "ORGANIZATION")
    .then(pl.col("REGISTRATION_COUNTRY"))
    .otherwise(None)
    .alias("country")
    )

print(df.filter(pl.col("name") == "Abassin Badshah"))
```
The above code snippet processes the nested JSON data from the Open Ownership dataset to extract the
country of nationality of the entity. Note that instead of using vanilla Python functions, we're using
the [when-then-otherwise](https://docs.pola.rs/api/python/dev/reference/expressions/api/polars.when.html)
expression to handle the different cases. This is much more efficient than mapping a custom Python
function over the entire DataFrame, while also being more readable[^2].

Similar operations are performed on the remaining fields from the Open Ownership as well
as the OpenSanctions data to preprocess the data that will be used to create the individual
subgraphs for each source in Kuzu downstream. Here's the subset of the Open Ownership data
that contains information about the entity "Abassin Badshah": there are two records for this entity,
with different addresses in the UK.

```
┌─────────────────┬──────────────────────┬─────────┬─────────────────────────────────┐
│ name            ┆ id                   ┆ country ┆ address                         │
│ ---             ┆ ---                  ┆ ---     ┆ ---                             │
│ str             ┆ str                  ┆ str     ┆ str                             │
╞═════════════════╪══════════════════════╪═════════╪═════════════════════════════════╡
│ Abassin Badshah ┆ 17207853441353212969 ┆ GB      ┆ 31, Quernmore Close, Bromley, … │
│ Abassin Badshah ┆ 6747548100436839873  ┆ GB      ┆ 3, Market Parade, 41 East Stre… │
└─────────────────┴──────────────────────┴─────────┴─────────────────────────────────┘
```

### Bulk-ingest data

Kuzu can natively scan and copy from DataFrames from Polars. There are several advantages to copying data
directly from DataFrames:

- There's no need to write out transformed data to external files -- under the hood, the Polars DataFrame object is
transformed into an Arrow table, and Kuzu scans and transforms Arrow data types into native Kuzu data types.
Like Kuzu, Polars/Arrow are also columnar systems, so the overall transport of data is more
efficient than reading from disk-based formats like CSV or JSON.
- The same DataFrame object in memory can be subset and used to populate multiple tables in Kuzu,
which reduces unnecessary I/O operations.
- The Arrow table is passed to Kuzu in batches, so there's no need to write loops in Python to handle
the batches, minimizing Python-related overhead.

All in all, this is an efficient and scalable way to ingest data into Kuzu! The following code snippet
shows how to bulk-ingest the data into the `OpenSanctions` and `OpenOwnership` node tables in Kuzu,
as well as the relationships between them and the `Entity` nodes obtained from the Senzing entity resolution workflow.

```py
import kuzu

db = kuzu.Database("kuzu_er_db")
conn = kuzu.Connection(db)

# Define the schema (create node tables and relationship tables)
conn.execute("CREATE NODE TABLE IF NOT EXISTS OpenSanctions (id STRING PRIMARY KEY, kind STRING, name STRING, addr STRING, url STRING)")
conn.execute("CREATE NODE TABLE IF NOT EXISTS OpenOwnership (id STRING PRIMARY KEY, kind STRING, name STRING, addr STRING, country STRING)")
conn.execute("CREATE NODE TABLE IF NOT EXISTS Entity (id STRING PRIMARY KEY, descrip STRING)")
conn.execute("CREATE REL TABLE IF NOT EXISTS Role (FROM OpenOwnership TO OpenOwnership, role STRING, date DATE)")
conn.execute("CREATE REL TABLE IF NOT EXISTS Related (FROM Entity TO Entity, why STRING, level INT8)");

# Bulk-ingest the data from their respective Polars DataFrames
conn.execute("COPY OpenSanctions FROM df_os")
conn.execute("COPY OpenOwnership FROM df_oo")
conn.execute("COPY Entity FROM (LOAD FROM df_ent RETURN id, descrip)")

# ... more code to transform the data to gather the relationships into another DataFrame

# Bulk-ingest the relationships between the entities
conn.execute("COPY Role FROM df_oa_relationships")
conn.execute("COPY Role FROM df_os_relationships")

# Create relationship table between Senzing entities and original source nodes
conn.execute(
    """
    CREATE REL TABLE IF NOT EXISTS Matched (
        FROM Entity TO OpenSanctions,
        FROM Entity TO OpenOwnership,
        why STRING,
        level INT8
    )
"""
)
conn.execute("COPY Matched FROM df_sz_os (from='Entity', to='OpenSanctions')");
conn.execute("COPY Matched FROM df_sz_oo (from='Entity', to='OpenOwnership')");
```

Using this approach, we can incrementally bring in large amounts of data via Polars transformations
to build the graph in Kuzu. For this sample dataset, we obtain the following graph around the vicinity of the entity
"Abassin Badshah":

```py
MATCH (a:Entity)-[b *1..3]-(c)
WHERE a.descrip CONTAINS "Abassin"
RETURN * LIMIT 50
```

<Img src="/img/creating-high-quality-knowledge-graphs/kgc-er-4.png" alt="Kuzu graph around the vicinity of the entity 'Abassin Badshah'">

- Yellow nodes represent the entities obtained from the Senzing entity resolution workflow, 
- Green nodes represent OpenSanctions entities
- Red nodes represent Open Ownership entities
- Blue nodes represent the risks associated with OpenSanctions entities

As can be seen, entity resolution works by _overlaying_ the resolved entities on top of the original
graph (rather than physically merging the two graphs). By writing an undirected Cypher query to
traverse paths around the vicinity of entities that contain the string "Abassin", we can find all
the relevant data relevant to the entity Abassin Badshah. A number of shell companies are identified
as "related" to Abassin Badshah, and his spouse, Rehana Badshah, who worked together in a tax evasion scheme[^4].
This demonstrates the power of bringing together multiple data sources to analyze financial crimes.

## Network analysis

Writing simple Cypher queries to visually explore the graph is good enough for a local understanding of an entity
and what it's connected to. However, we can do better than that! In this section, we'll cover an example
of running a graph algorithm (betweenness centrality) to identify central players in the network.

Betweenness centrality is a useful algorithm for identifying key players in fraud rings because it measures
how often a node appears on the shortest paths between other nodes. Nodes with high betweenness centrality could
indicate potential money laundering or other suspicious financial activities.

Kuzu makes it simple to run graph algorithms on the graph via NetworkX or via a native
graph algorithms package[^3].

```py
import polars as pl
import networkx as nx

# Export Kuzu subgraph to NetworkX
# We only ask for Senzing entities, OpenOwnership entities, and OpenSanctions entities
subg = conn.execute(
    """
    MATCH (a:Entity:OpenOwnership:OpenSanctions)-[b]->(c:Entity:OpenOwnership:OpenSanctions)
    RETURN *
    """
)
subg_networkx = subg.get_as_networkx(directed=True)

# Run NetworkX's betweenness centrality algorithm
bc = nx.betweenness_centrality(subg_networkx)

#  Transform the betweenness centrality results into a Polars dataframe
df = pl.DataFrame({"id": k, "betweenness_centrality": v} for k, v in bc.items())
df = (
    df.with_columns(
        pl.col("id").str.replace("Entity_", "")
        .str.replace("OpenOwnership_", "")
        .str.replace("OpenSanctions_", "")
    )
)

# Bring the data back into Kuzu
conn.execute(
    f"""
    LOAD FROM df
    MERGE (s1:Entity {{id: id}})
    SET s1.betweenness_centrality = betweenness_centrality
    MERGE (s2:OpenSanctions {{id: id}})
    SET s2.betweenness_centrality = betweenness_centrality
    MERGE (s3:OpenOwnership {{id: id}})
    SET s3.betweenness_centrality = betweenness_centrality
    """
)
```

The above code shows how to easily transform a Kuzu subgraph into a NetworkX graph, run a graph algorithm
on it, and then bring the results back into Kuzu.

We can now visualize the neighbourhood of the node with the highest betweenness centrality in the graph
using the following Cypher query:

```cypher
MATCH (a:Entity)
RETURN a.id, a.descrip, a.betweenness_centrality
ORDER BY a.betweenness_centrality DESC
LIMIT 1
```
The node with the highest betweenness centrality is Victor Nyland Poulsen.
```
┌───────────┬───────────────────────┬──────────────────────────┐
│ a.id      ┆ a.descrip             ┆ a.betweenness_centrality │
│ ---       ┆ ---                   ┆ ---                      │
│ str       ┆ str                   ┆ f32                      │
╞═══════════╪═══════════════════════╪══════════════════════════╡
│ sz_100036 ┆ Victor Nyland Poulsen ┆ 0.002753                 │
└───────────┴───────────────────────┴──────────────────────────┘
```

With the node ID identified via the above query, we can now visualize the neighbourhood of the node
as follows:

```cypher
MATCH (a)-[b]->(c:Entity)-[d *1..4]->(e)
WHERE c.id = "sz_100036"
RETURN * LIMIT 200;
```

<Img src="/img/creating-high-quality-knowledge-graphs/kgc-er-5.png" alt="Kuzu graph around the vicinity of the entity 'Victor Nyland Poulsen'">

The high betweenness centrality score of the entity named "Victor Nyland Poulsen" is due to the fact that
he is a key bridge node between entities, appearing  on the shortest paths between several other entities.
Using the power of graph algorithms, we are able to identify key players in the data to uncover
relevant insights!

## Conclusions

In this post, we covered a sequence of steps to create a high-quality knowledge graph from multiple data sources,
using Kuzu and Senzing. Entity resolution is a key step in this process, as there could be duplicate entities
in the data that could hinder the efforts of analysts who are looking to discover insights from the connected
data. Performing entity resolution using Senzing's Python SDK and persisting the resolved entities to a Kuzu database
allows for efficient and scalable investigative graph analyses downstream.

To summarize, the following key steps were covered in this post:

- Using Senzing's Python SDK to perform entity resolution on the data from two independent data sources: OpenOwnership and OpenSanctions
- Using Polars to preprocess the data for ingestion into Kuzu
- Ingesting the Senzing entities, OpenSanctions and OpenOwnership subgraphs into a single Kuzu database
- Querying the graph to find relevant insights about entities of interest (e.g., "Abassin Badshah")
- Using NetworkX to run graph algorithms on the graph to discover key players in the network

The benefits of Senzing are that it's a real-time, powerful entity resolution engine that can be used
in high-impact scenarios like financial crime investigations, providing domain experts with high-quality
data sourced from multiple providers. The benefits of Kuzu are that it's fast, easy-to-use, open source,
and interoperates well with other frameworks and tools to help rapidly transform your existing data
into useful insights through the power of graphs. Combining these two technologies enables organizations
to build robust, high-quality and **scalable** knowledge graphs to help uncover insights in
all sorts of interesting domains. We hope you found this hands-on demo useful!

## Code and data

You can reproduce the entire workflow shown in this post using the code that was demonstrated
at the Knowledge Graph Conference 2025 in NYC. See this [GitHub repository](https://github.com/kuzudb/kgc-2025-workshop-high-quality-graphs).



---

[^1]: Senzing blog: [What is entity resolution?](https://senzing.com/what-is-entity-resolution/)
[^2]: Polars' `when-then-otherwise` expressions are similar to `if-elif-else`
blocks in vanilla Python: `when -> if`, `then -> elif`, `otherwise -> else`. In Polars, expressions
are executed in a vectorized manner (rather than row-by-row when using vanilla Python functions
with `map_rows`), which is why Polars expressions are _much_ faster, and recommended for processing larger datasets.
See the [Polars documentation](https://docs.pola.rs/api/python/dev/reference/expressions/api/polars.when.html)
for more examples on `when-then-otherwise` expressions.

[^3]: Kuzu's native [graph algorithms package](https://docs.kuzudb.com/extensions/algo/) is available as
an extension in Kuzu, and contains several popular graph algorithms, with more being added as of writing this blog post.
For algorithms that are not yet availabe natively in Kuzu, NetworkX is a good alternative, as it contains
an extensive suite of graph algorithms and converting between a Kuzu subgraph and a NetworkX graph is straightforward.

[^4]: Abassin Badshah is infamous for his 2021 conviction for tax fraud while operating a Papa John’s takeaway in London.
Badshah under-declared income, evading £669,000 in Income Tax, National Insurance, and Corporation Tax. He was sentenced to four years in prison following an investigation by HM Revenue and Customs (HMRC), which highlighted his suppression of sales figures.
The data for OpenSanctions marks Badshah as a "sanctions risk" and his name is one of several other examples of financial misconduct
that can be revealed by analyzing the connected information in these datasets.


