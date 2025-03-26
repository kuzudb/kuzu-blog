---
title: "Using MCP to debug database applications"
description: "Introducing Kuzu's MCP server that allows you to connect MCP clients like Claude Desktop and Cursor agents to your Kuzu database"
pubDate: "Mar 25 2025"
heroImage: "/img/kuzu-mcp-server/kuzu-mcp-banner.png"
categories: ["example"]
authors: ["prashanth", "chang", "semih"]
tags: ["kuzu", "mcp-server", "mcp", "llm"]
---

Unless you've been living under a rock, you've probably been hearing a lot about the Model Context Protocol (MCP),
introduced by Anthropic in late 2024. We're happy to announce that Kuzu now provides an MCP server that allows you to connect
MCP clients -- such as [Claude Desktop](https://www.anthropic.com/news/claude-desktop) and [Cursor](https://www.cursor.com/)
agents -- to your Kuzu databases! This post has two goals. First, we'll cover the basics of MCP and walk through how to connect
your Kuzu databases to these two popular MCP clients using Kuzu's MCP server. 
Second, we'll demonstrate how this can benefit developers using a simple scenario: a software developer
debugging the output of a Cypher query with the help of an agent. But first, let's review MCP.

## What is MCP?

[MCP](https://docs.anthropic.com/en/docs/agents-and-tools/mcp) is an open protocol developed by Anthropic
that standardizes how LLMs can interact with external data sources and services
to obtain external data and/or take actions in the real world. 
MCP is a standardized client-server protocol where the client and server have the following roles:

- Client is a "host application" that uses an LLM, such as Cursor or Claude Desktop. Client can
read data from the server and/or make remote procedure calls to some functions exposed by the server. Through these
function calls, an LLM can take actions in the real world when it is prompted to perform a task by a human.
- Server is a tool or service that exposes external data and/or functions to the LLM. 

Here is an example of how this architecture looks like with Kuzu MCP server in the role of the server.
<Image src="/img/kuzu-mcp-server/kuzu-mcp-server-to-client.png" alt="Kuzu MCP client-server overview" />

We will make this architecture very concrete in our demonstration scenario later in this post.
For now, we just note that there is a proliferation of MCP servers (some are listed [here](https://github.com/punkpeye/awesome-mcp-servers)).
People are building different services that can be exposed to
LLMs, each one giving more capabilities to LLMs to solve more complex and varied tasks automatically.
You can point LLMs to fetch the latest stock and coin listings, to search nearby restaurants or help manage
your Kubernetes cluster. Soon you may find yourself using an LLM to order your food, make doctor's appointments, 
or perform bank transactions (if you trust LLMs to do so). Speaking of doctor's appointments:
if you have read the initial [vision paper](https://www-sop.inria.fr/acacia/cours/essi2006/Scientific%20American_%20Feature%20Article_%20The%20Semantic%20Web_%20May%202001.pdf) 
of [the semantic web](https://en.wikipedia.org/wiki/Semantic_Web)
articulated in the seminal paper by [Tim Berners-Lee](https://en.wikipedia.org/wiki/Tim_Berners-Lee), [James Hendler](https://en.wikipedia.org/wiki/James_Hendler), 
and [Ora Lassila](https://en.wikipedia.org/wiki/Ora_Lassila), the proliferation of MCP servers should remind you
of the imagined agentic application in the first paragraphs of that paper: an AI agent automatically
talking to separate servers to make a doctor's appointment for your mom.
There are of course vast differences between how the semantic web paper imagines such agents and 
servers could work and how LLMs and MCP servers work. For example, the paper imagines
the data exchanged between servers is RDF triples. Instead, LLMs exchange text, i.e., natural language,
with servers[^1]. Nonetheless, one can see a different form of the semantic web 
vision being realized in the proliferating MCP ecosystem.
But let us leave this fascinating topic for another post.

[^1]: If you look at the 2nd page of [the semantic web paper](https://www-sop.inria.fr/acacia/cours/essi2006/Scientific%20American_%20Feature%20Article_%20The%20Semantic%20Web_%20May%202001.pdf),
there is a quote: "The Semantic Web will  enable machines to COMPREHEND semantic documents and data, not human speech and writings."
This was hinting that semantic agents would understand ontologies and knowledge represented in RDF instead of text in web documents.
In contrast to this vision, LLMs, which are modern day agents, comprehend human writings.

## Kuzu MCP Server
We did our share in contributing to the MCP ecosystem and built a Kuzu MCP server (henceforth Kuzu-MCP). You start the Kuzu-MCP server by pointing it 
to a database. To be accurate, you do not start the MCP Server yourself. Instead, as we will show momentarily,
you configure Cursor or Claude Desktop to start the server as they start themselves.
Kuzu-MCP exposes the following two functions to LLMs:
| Function | Description |
|----------|-------------|
| `getSchema` | Returns the schema of the database |
| `query` | Executes a Cypher query on the database |

Using these functions, the LLM can read the node and relationship tables in Kuzu and run Cypher queries on the database
to perform actions. In both Cursor and Claude Desktop, each time the LLM wants to run one of these functions,
it asks your permission and you can choose to provide permission or not. 
If you are worried about the LLM accidentally modifying your database, you can also
run Kuzu-MPC in read-only mode (see [below](#launch-cursor-with-kuzu-mcp)), in which case, Kuzu-MCP will not run any queries that modify the database.

## Demonstration scenario: A debugging session

Kuzu-MCP is can be particularly useful to developers who want to use an LLM as an
advanced programming assistant while developing Kuzu applications. In this post, we assume a
scenario of a software developer who is using Kuzu as the database of an application and debugging a Cypher query that is not returning
an expected result. The developer will delegate the job of debugging to the LLM, which will do its own debugging
session until it finds the root cause of the problem. 

[//]: # (through its own debuggig sessions interacting with the database.)
[//]: # (The example bug in the scenario is admittedly simple but the important thing to take away is this:)
[//]: # (The LLM will really do the debugging for you by issuing multiple queries to the database,)
[//]: # (and will do so without any detailed prompting at all.)
[//]: # (We will simply give it the Cypher query and say it is not returning the expected)
[//]: # (result. We will not interpret to the LLM what we are trying to do with the query. It will understand the query)
[//]: # (and go through a few possibilities to find the cause. Let's get through the scenario.)

### A bug in a hierarchical financial asset database 

Our example consists of a simple database of companies and the bonds they issue, where companies
may be parents or subsidiaries of other companies. The schema of the database looks as follows:
- `Company(cID serial, name string, primary key (cid))` nodes.
- `Bond(bID serial, name string, yield float, primary key (bID))` nodes.
- `ParentOf(from Company, to Company)` relationships, which form a hierarchy of companies.
- `Issues(from Company, to Bond)` relationships, indicating which company issued which bonds.

<Image src="/img/kuzu-mcp-server/graph-schema.png" alt="Graph schema for the financial asset database" />

Next, suppose a developer is developing some analytics application on a dataset
that consists of 3 companies: `A`, `B`,and `C`, where `A` is the parent of both `B` and `C`. 
Therefore, the developer expects that `A` is the root of the company hierarchy.
Further, each company issues two bonds. So there are 6 bonds in total in the database.
Suppose the developer has a test case that checks that the number of total bonds is equal to the number of bonds issued by `A`
or any of its direct or indirect subsidiaries. 
The test case is the following:
```cypher
MATCH (a {name: "CompanyA"})-[e*]->(b:Bond)
WITH count(*) as bondsReachableByA 
MATCH (b:Bond) 
WITH bondsReachableByA, count(*) as allBonds
RETURN (bondsReachableByA = allBonds) as equal;
```
The result of the query must be `true` if `A` is the root of the company hierarchy because
the root company can reach every company in the database, and through them it can reach every bond in the database.
For the purpose of demonstration, suppose the database has a bug and is missing the `(A)-[:ParentOf]->(B)` relationship. 
Therefore, the database actually looks as follows:

<Image src="/img/kuzu-mcp-server/graph-viz.png" alt="Graph visualization for the financial asset database" />

As a result of this bug the developer observes that the test is failing.
We will next show how to use Cursor along with Kuzu-MCP to debug this issue. 
We will assume in the rest of
the post that the Kuzu database is in directory `/path/to/your/local/financedb`.
If you want to replicate the rest of the steps in this post, use the Cypher queries [here](https://gist.github.com/prrao87/ed0711a2339b75e462f0e1a31c766e7b)
to create the buggy database above and
just replace occurences of `/path/to/your/local/financedb` with your local directory.

### Launch Cursor with Kuzu-MCP
Cursor is a popular IDE that supports MCP clients in its agents mode. To connect to the Kuzu MCP server from Cursor,
you need to do following:

1. Install the Cursor app from [cursor.com](https://www.cursor.com/).
2. Open the Cursor app and navigate to the "Cursor" menu on the top left corner.
3. Click on "Settings > Cursor Settings" and then click on the "MCP" tab.
4. Click on "Add new global MCP server", which will open a new file called `mcp.json`.

To start Kuzu-MCP as Cursor starts, enter the following configuration into the `mcp.json` file:

```json
{
    "mcpServers": {
        "kuzu": {
            "command": "docker",
            "args": [
                "run",
                "-v",
                "/path/to/your/local/financedb:/database",
                "-e",
                "KUZU_READ_ONLY=true",
                "--rm",
                "-i",
                "kuzudb/mcp-server"
            ]
        }
    }
}
```
Note that we set `-e KUZU_READ_ONLY=true` to run Kuzu-MCP in read-only mode, because in
this session, we only want to use the LLM to read data from the database. Save the file, and restart the Cursor app.

### Ask Cursor to debug the query
Perhaps the coolest part of this demo is how we run the debugging session with a very simple question to Cursor.
We start a new chat and ask this simple question:
```text
From the kuzu database, I expect the result of the following query to be true. Why do I get false?
MATCH (a {name: "CompanyA"})-[e*]->(b:Bond) 
WITH count(*) as bondsReachableByA 
MATCH (b:Bond) 
WITH bondsReachableByA, count(*) as allBonds
RETURN (bondsReachableByA = allBonds) as equal;
```

Let's see what happens when we ask Cursor to debug this query. The LLM used is Claude 3.7 Sonnet.

<Image src="/img/kuzu-mcp-server/kuzu-mcp-cursor.gif" alt="Cursor debugging the query" />

After running a few queries via the `query` function, the LLM finds out that the 
reason the query returns false is that not all bonds in the database are reachable from `CompanyA`.
Specifically, `A` does not have an edge to `B` and suggests that as the solution. Although we know we are at the phase
where we are very used to being surprised by the things LLMs can do, it is still cool
to see that it did the entire debugging session successfully, with an extremely simple prompt *and only one prompt*.

Notice also that its reasoning is quite sound and really mimics what a human would do in a debugging session.
First it looked at the database schema to understand the
types of nodes and relationships. That's the first time it's seeing the database. Then it understood what the query is asking:
"whya are all bonds not reachable from `CompanyA`". Then it inspected which nodes are connected to which other nodes
to find that the graph is disconnected and suggested to add an edge from `A` to `B` (or alternatively change the query).
That's how the human developer would approach this problem as well.

If you already use Cursor, you'll know that it's really good at debugging code, since it can see your entire code base.
With MCP servers of databases, clients like Cursor can also help you debug problems _in your data itself_!

### Use Kuzu-MCP in Claude Desktop
You can also use Kuzu-MCP with [Claude Desktop](https://www.anthropic.com/news/claude-desktop), which is also completely able to go through a similar debugging session
and get to the root cause of the problem. We will not present the Claude Desktop interaction here but only show you
how you can start Claude Desktop with Kuzu-MCP. The steps are as follows:

1. Install the Claude Desktop app from [claude.ai](https://claude.ai/download).
2. Open the Claude Desktop app and navigate to the "Settings" tab.
3. Click on the "Developer" tab and then on "Edit config".
4. This opens the directory containing the `claude_desktop_config.json` file.

Open the `claude_desktop_config.json` file in a text editor and copy-paste the following configuration into it.
This is a Docker command that will start the Kuzu MCP server, and connect via a read-only connection to the Kuzu database
on your local machine. 

```json
{
    "mcpServers": {
        "kuzu": {
            "command": "docker",
            "args": [
                "run",
                "-v",
                "/path/to/your/local/financedb:/database",
                "-e",
                "KUZU_READ_ONLY=true",
                "--rm",
                "-i",
                "kuzudb/mcp-server"
            ]
        }
    }
}
```
Save the file, and restart the Claude Desktop app. You should now be able to
start querying the database via the MCP server.

## Key takeaways

In this post we demonstrated how Kuzu-MCP can be useful when developing applications with Kuzu. We used
a simple debugging session as an example. Since Kuzu-MCP allows LLMs to execute arbitrary Cypher queries
on your databases, you can also get LLMs to modify or populate your database. All of this can be done 
with very simple prompts, instead of writing detailed prompt instructions with your schema or contents of your database. 
You can of course get a lot more creative and get LLMs to do many other tasks, such as ETL across databases, 
advanced data analytics or visualizations, by exposing them to MCP servers of multiple data systems.
We plan to cover more demonstrative examples in future posts.

The MCP ecosystem is progressing fast
and we are actively keeping
an eye on the latest developments in the ecosystem.
We'd love to work with our user community  to learn about how they intend to use MCP servers and clients
in their applications. So, please try out our MCP server, share your thoughts
on [Discord](https://kuzudb.com/chat), and check out our [GitHub](https://github.com/kuzudb/kuzu). Till next time!

---
