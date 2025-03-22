---
title: "MCP meets Kuzu: Bringing AI to your graph databases"
description: "Introducing Kuzu's MCP server that allows you to connect MCP clients like Claude Desktop and Cursor agents to your Kuzu database"
pubDate: "Mar 24 2025"
heroImage: "/img/kuzu-mcp-server/kuzu-mcp-banner.png"
categories: ["example"]
authors: ["prashanth", "chang"]
tags: ["kuzu", "mcp-server", "mcp", "llm"]
---

Unless you've been living under a rock, you've probably been hearing a lot about the Model Context Protocol (MCP),
introduced by Anthropic in late 2024. We're happy to announce that Kuzu now provides an MCP server that allows you to connect
MCP clients like [Claude Desktop](https://www.anthropic.com/news/claude-desktop) and [Cursor](https://www.cursor.com/)
agents to your Kuzu database! This blog post will introduce the basics of MCP, and briefly demonstrate how to connect
your Kuzu databases via two popular MCP clients.

## What is MCP?

[MCP](https://docs.anthropic.com/en/docs/agents-and-tools/mcp) is an open protocol developed by Anthropic
that standardizes how tools and applications provide relevant context to large language models (LLMs). MCP has gained
popularity very rapidly of late, largely due to the fact that it provides a standardized way for any LLM to interact
with a variety of external data sources and tools, including databases. At Kuzu, we're all about making it easier for
developers to build and deploy AI workflows on top of graph databases, and we thought it apt to contribute
to the rapidly growing MCP ecosystem by providing an MCP server that allows you to connect your graph database
to MCP clients.

MCP follows a client/server architecture, where the client's role is to route requests from the host application to
the server. The server is responsible for exposing resources, tools and prompts to the client. In the case
of Kuzu, the MCP server we provide allows local access to the specified Kuzu database, and the client can
be an application like Claude Desktop or Cursor, which each provide their MCP-compatible clients. The
general layout is shown below.

<Image src="/img/kuzu-mcp-server/kuzu-mcp-server-to-client.png" alt="Kuzu MCP client-server overview" />

## Create the Kuzu database

Let's first create a Kuzu database to use in this example. Let's use a simple example of football players
from two countries, Argentina, who won the 2022 World Cup, and France, who won the 2018 World Cup.
The first step is to define the schema in Kuzu that captures the relationships between players, the
countries they play for, and the world cups those countries have won. This can be done by opening a Kuzu
CLI and executing the following DDL commands:

```sql
CREATE NODE TABLE Player(name STRING PRIMARY KEY, goalsScored INT32);
CREATE NODE TABLE Country(name STRING PRIMARY KEY, worldCupsWon INT32);
CREATE NODE TABLE WorldCup(year INT32 PRIMARY KEY, host STRING);
CREATE REL TABLE PLAYS_FOR(FROM Player TO Country);
CREATE REL TABLE WON(FROM Country TO WorldCup);
```

Next, we can insert the data into the database using Cypher.
```cypher
// Create Country nodes
CREATE (argentina:Country {name: "Argentina", worldCupsWon: 3})
CREATE (france:Country {name: "France", worldCupsWon: 2})

// Create Player nodes
CREATE (messi:Player {name: "Lionel Messi", goalsScored: 112})
CREATE (dimaria:Player {name: "Angel Di Maria", goalsScored: 31})
CREATE (mbappe:Player {name: "Kylian Mbappe", goalsScored: 48})
CREATE (griezmann:Player {name: "Antoine Griezmann", goalsScored: 44})

// Create WorldCup nodes
CREATE (wc2022:WorldCup {year: 2022, host: "Qatar"})
CREATE (wc2018:WorldCup {year: 2018, host: "Russia"})

// Create PLAYS_FOR relationships
CREATE (messi)-[:PLAYS_FOR]->(argentina)
CREATE (dimaria)-[:PLAYS_FOR]->(argentina)
CREATE (mbappe)-[:PLAYS_FOR]->(france)
CREATE (griezmann)-[:PLAYS_FOR]->(france)

// Create WON relationships
CREATE (argentina)-[:WON]->(wc2022)
CREATE (france)-[:WON]->(wc2018)
```

The database created using the above commands is stored in a directory named `football_db` on the local disk.

## MCP server

The official MCP [specification](https://spec.modelcontextprotocol.io/specification/2024-11-05/architecture/)
released by Anthropic describes the key design principles of an MCP server. If you're interested in more details,
it's recommended to read the specification document in its entirety. The key qualities of an MCP server are summarized below:

- **Simple and easy to build**: it should focus on specific, well-defined capabilities
- **Highly composable**: it should isolate capabilities such that multiple servers can be combined seamlessly
- **Maintain isolation**: only the necessary contextual information should be exposed to the server
- **Progressively add features**: Additional capabilities can be added without breaking existing clients

Kuzu's MCP server is implemented in Node.js using the above guidelines, and exposes the following functions:
| Function | Description |
|----------|-------------|
| `getSchema` | Get the schema of the database |
| `query` | Execute a Cypher query on the database |

When you initialize a connection to the Kuzu MCP server, you open a read-write connection to the database,
following which the client can send queries to the database via the server. The LLM that governs the MCP client
decides what operations to perform based on the exposed functions in the MCP server.

Note that Kuzu currently only supports connecting to local MCP servers running on
your machine that connect to a local Kuzu database. Remote MCP connections and remote databases are not supported
as of now.

## Example client 1: Claude Desktop

One of the most popular MCP clients is [Claude Desktop](https://www.anthropic.com/news/claude-desktop),
which provides access to Anthropic's Sonnet 3.7 large language model, a highly capable LLM that can
answer questions, write code, and more.

To connect to the Kuzu MCP server from Claude Desktop, you need to follow these steps:

1. Install the Claude Desktop app from the [official website](https://claude.ai/download).
2. Open the Claude Desktop app and navigate to the "Settings" tab.
3. Click on the "Developer" tab and then on "Edit config"
4. This will open the directory containing the `claude_desktop_config.json` file.

Open the `claude_desktop_config.json`    file in a text editor and copy-paste the following configuration into it.
This is basically a Docker command that will start the Kuzu MCP server, and connect it to the Kuzu database
on your local machine.

```json
{
    "mcpServers": {
        "kuzu": {
            "command": "docker",
            "args": [
                "run",
                "-v",
                "/path/to/your/database/football_db:/database",
                "--rm",
                "-i",
                "kuzu-mcp-server"
            ]
        }
    }
}
```
All you have to do is replace `/path/to/your/database/football_db` with the absolute path to the Kuzu
database on your machine. Save the file, and restart the Claude Desktop app. You should now be able to
start querying the database via the MCP server!

<Image src="/img/kuzu-mcp-server/mcp-kuzu-claude-1.png" alt="Claude Desktop MCP client chat window at open" />

You should see a tool icon on the bottom right corner of the chat window, which indicates that the
Claude Desktop app sees the available tools from the MCP server. To test it, we can begin asking
questions about football players from Argentina.

<Image src="/img/kuzu-mcp-server/mcp-kuzu-claude-2.gif" alt="Asking the Claude Desktop MCP client to tell us about the players from Argentina" />

The first query run is the `getSchema` function, which returns the schema of the database, following which
another query is executed to get the players from Argentina via the `query` function. Each time the agent
needs to send a query to the database, it will first ask for permission from the user. This is part
of the safety measures built into the MCP protocol, which every MCP client is responsible to maintain.

As can be seen from the response, the players from Argentina in the database are Lionel Messi and Angel Di Maria.

## Example client 2: Cursor

Cursor is a popular IDE that supports MCP clients in its agents mode. To connect to the Kuzu MCP server from Cursor,
you need to follow these steps:

1. Install the Cursor app from the [official website](https://www.cursor.com/).
2. Open the Cursor app and navigate to the "Cursor" menu on the top left corner.
3. Click on "Settings > Cursor Settings" and then click on the "MCP" tab.
4. Click on "Add new global MCP server", which will open a new file called `mcp.json`.

We will run the Kuzu MCP server inside Cursor via Node.js by entering the following configuration into the `mcp.json` file:

```json
{
    "mcpServers": {
        "kuzu": {
            "command": "docker",
            "args": [
                "run",
                "-v",
                "/path/to/your/local/football_db:/database",
                "--rm",
                "-i",
                "kuzu-mcp-server"
            ]
        }
    }
}
```
The above configuration is similar to the one we used in the Claude Desktop example. Once again, ensure that
you replace `/path/to/your/local/football_db` with the absolute path to the Kuzu database on your machine
in order for the Cursor client to be able to access the database. Save the file, and restart the Cursor app.

You should now be able to query and update the database using a Cursor agent by opening a new chat window!

<Image src="/img/kuzu-mcp-server/mcp-kuzu-cursor-1.png" alt="Cursor MCP client chat window at open" />

To test it, let's ask the agent to tell us about the players from France.

<Image src="/img/kuzu-mcp-server/mcp-kuzu-cursor-2.gif" alt="Asking the Cursor MCP client to tell us about the players from France" />

The MCP client will route the query to the Kuzu MCP server, which will ask for permission to execute the query.
The Claude 3.7 Sonnet model decides to first get the database schema via the `getSchema` function, and then
executes another Cypher query to get the players from France via the `query` function. Each time the agent
needs to send a query to the database, it will first ask for permission from the user. This is part
of the safety measures built into the MCP protocol, which every MCP client is responsible to maintain.

As per its response, we can see that the players from France are Kylian Mbappe and Antoine Griezmann.
Here's the query that was executed by the Cursor agent:

```json
{
  "cypher": "MATCH (p:Player)-[:PLAYS_FOR]->(c:Country)\nWHERE c.name = 'France'\nRETURN p.name, p.goalsScored"
}
```

```
The French players in your Kuzu database are:
Kylian Mbappe (48 goals scored)
Antoine Griezmann (44 goals scored)
```

Let's ask a follow-up question: 
"_Which French player has scored the most goals for his country?_"

<Image src="/img/kuzu-mcp-server/mcp-kuzu-cursor-3.gif" alt="Asking the Cursor MCP client to tell us about the French player with the most goals" />

The Cursor chat retains the recent history of the conversation, and the agent can continue to answer questions
about the data it already retrieved. Claude 3.7 Sonnet, the LLM that governs the Cursor agent, decides that it doesn't need to
send another query to the database because it's able to reason about the data it already has. Not bad!

```
Based on the previous query results, Kylian Mbappe scored 48 goals, which is more than Antoine
Griezmann's 44 goals. So Kylian Mbappe is the French player who scored the most goals for his country.
```

As shown, the LLM is able to make certain decisions on behalf of the user, either through its own
reasoning ability, or through simple queries that it can issue to the database.

## Update the database via MCP client

Using a given MCP client, you can also issue queries that modify or update the database. Let's say we want to add a new
country, Germany along with the number of world cups they have won (4). We could, of course, do this
by opening the Kuzu CLI and executing the following command:

```sql
CREATE (germany:Country {name: "Germany", worldCupsWon: 4})
```

But to make it more interesting, let's use the Cursor MCP client to do this!

<Image src="/img/kuzu-mcp-server/mcp-kuzu-cursor-4.gif" alt="Asking the Cursor MCP client to add a new country to the database" />

As can be seen, the Cursor agent checks the database schema, ensures that the new country is not already
present in the database, and then issues a Cypher query to add the new country to the database. Because
it knows the database schema, it knows that there exists a property `worldCupsWon` that is an `INT32`
type, and then uses the correct value for the `worldCupsWon` property. In the end, it even runs a query
for us to verify that the new country was successfully added to the database.

## Key takeaways

In this blog post, we introduced the basics of the Model Context Protocol (MCP) and the newly added Kuzu MCP server implementation
(see [here](https://github.com/kuzudb/kuzu-mcp-server) for the source code).
We show how to connect to a Kuzu database from two popular MCP clients, Claude Desktop and Cursor.
Using just two simple functions from our MCP server: `getSchema` and `query`, we were able to
use multiple MCP clients (and their associated LLMs) to answer questions about the data and
even update the data by adding new data to the database!

MCP is a rapidly evolving protocol, and like many other database developers, we are actively keeping an
eye on the latest developments in the MCP ecosystem. The current MCP server implementation of Kuzu includes
just one component: tools, though the core MCP specification includes additional components
such as [prompts](https://modelcontextprotocol.io/docs/concepts/prompts) and [resources](https://modelcontextprotocol.io/docs/concepts/resources)
that were not covered in this blog post. If you are
interested in exploring other applications using MCP on top of Kuzu, please reach out to us on [Discord](https://kuzudb.com/chat).

The primary purpose of MCP is to make it easier for numerous clients (other than just Claude Desktop and Cursor)
to easily connect to tools and databases. We hope this blog post has been helpful for you to leverage
the power of LLMs to easily interact with and query your Kuzu graphs!