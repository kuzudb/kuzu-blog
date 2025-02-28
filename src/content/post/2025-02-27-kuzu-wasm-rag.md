---
slug: "kuzu-wasm-rag"
title: "Serverless Graph RAG in the Browser with Kùzu-Wasm"
description: "We built an experimental, fully in-browser Graph RAG using Kùzu-Wasm and WebLLM to process LinkedIn data locally. Users can explore a personal knowledge graph and query it with natural language—without any servers. While the results were mixed, this project highlights the potential of local AI-powered graph querying."
pubDate: "Feb 27 2025"
heroImage: "/img/default.png"
categories: ["example"]
authors: ["chang"]
tags: ["kuzu", "cypher", "graph", "rag", "wasm", "llm"]
---

Graph-based retrieval-augmented generation (RAG) has been gaining traction in the AI and database communities, but most implementations require a backend server to process graph queries and return results to an LLM. In this experimental project, we explored whether this process could be made entirely **serverless**, running inside the user’s browser without external infrastructure.  

Using **Kùzu-Wasm**, the WebAssembly version of the Kùzu graph database, we built a prototype of an in-browser **Graph RAG system**. Users can generate a personal knowledge graph from their **LinkedIn data dump**—including contacts, companies, messages, job positions, and skills—by simply dragging and dropping their CSV files into the web app. The graph is visualized using **vis.js**, and all query processing happens locally, without relying on a backend server.  

To allow natural language querying, we integrated **WebLLM**, which translates user questions into **Cypher queries**. These queries are executed directly in Kùzu-Wasm inside the browser, and the results are passed back to WebLLM for generating human-readable explanations. This enables a fully **local chatbot** capable of reasoning over personal LinkedIn data while keeping everything private on the user’s device.  

### Expanding Kùzu’s AI Integrations  

This experiment builds on our previous **LLM integrations** in the Kùzu ecosystem. We’ve explored using **LangChain** and **LlamaIndex** for enhancing retrieval and reasoning with graph-based data. Additionally, in **Kùzu Explorer**, our web-based UI, we introduced a feature that generates **Cypher queries from natural language prompts**, making it easier for users to interact with their data.  

While the results of this experiment have been mixed, it demonstrates a promising direction for **serverless graph querying** and **local AI-powered knowledge graphs**. In the following sections, we’ll break down how the system works, its challenges, and what we learned from this exploration.  

## Implementation

### Data Modeling and Ingestion  

The schema for our LinkedIn graph database is shown below:  

<Image src="/img/2025-02-27-kuzu-wasm-rag/schema.png" width="600" />

To ingest data into **Kùzu-Wasm**, we follow a multi-step process:  

1. **Upload CSV Files** – Users drag and drop their LinkedIn CSV files, which are stored in Kùzu-Wasm’s **virtual file system**.  
2. **Initial Processing** – Using Kùzu’s `LOAD FROM` feature, the raw CSVs are converted into **JavaScript objects** for further transformation.  
3. **Normalization** – In JavaScript, we clean and standardize the data by **fixing timestamps, formatting dates, and resolving inconsistent URIs**.  
4. **Data Insertion** – The cleaned data is inserted back into the **Kùzu graph database**, making it queryable.  

The implementation of this process is handled in **`src/utils/LinkedInDataConverter.js`**. The additional normalization step ensures that the LinkedIn dataset is well-structured and ready for querying.

### Graph Visualization  

To help users explore their LinkedIn data, we visualize the graph using **vis.js**. The transformation from database results to a visual graph is straightforward—nodes and relationships are extracted from the database, and we ensure that nodes are **deduplicated** before rendering.  

To enhance readability, we assign **different icons and colors** based on the type of entity. For example, people (contacts and the account owner) get a user icon, companies have a building icon, and skills use a lightbulb icon. This makes the graph more intuitive to navigate.  

The implementation for this visualization is handled in **`src/components/VisualizationView.vue`**. With vis.js, we can easily render the graph and provide interactive features like **zooming, panning, and node highlighting**.

### Natural Language Querying with WebLLM  

To enable **natural language querying**, we integrated **WebLLM**, allowing users to explore their LinkedIn data without manually writing Cypher queries. WebLLM translates user questions into **Cypher queries**, executes them locally in **Kùzu-Wasm**, and generates a **human-readable explanation** of the results.  

#### How It Works  

1. **Query Generation** – WebLLM retrieves the **graph schema** from Kùzu and constructs a **query generation prompt**, asking the model to translate the user's natural language question into a **valid Cypher query**.  
2. **Query Execution** – The generated Cypher query runs against Kùzu-Wasm.  
3. **Answer Generation** – The query results are formatted into structured JSON and fed back to WebLLM with a **QA prompt** to produce a natural language explanation.  

#### Prompt Adaptations  

We adapted the prompts from our **LangChain-Kùzu integration** ([GitHub Repo](https://github.com/kuzudb/langchain-kuzu/)), making a few modifications to improve accuracy and context awareness:  

- **Added Background Information** – We provide additional details about the LinkedIn data source in the prompt, helping the LLM better understand the structure and relationships in the dataset.  
- **Schema Representation in YAML** – Whenever possible, we represent the schema in **YAML instead of raw JSON**, as LLMs tend to parse and understand YAML more effectively.  


## Results  

We tested our **in-browser Graph RAG system** on a **MacBook Pro 2023 (M2 MAX, 32GB RAM)** using **Llama-3.1-8B-Instruct-q4f32_1-MLC**.  

### **Performance**  
- **Initial model fetch time**: ~300 seconds  
- **Generation speed**:  
  - **Prefill tokens**: 60-70 tokens/sec  
  - **Decode tokens**: 15-20 tokens/sec  
- **Average query generation time**: **10-15 seconds per user input**  

### **Accuracy of Generated Queries**  

For **simple queries**, the model performed well. It correctly generated Cypher queries for straightforward requests such as:  
- *"How many companies did I follow?"*  
- *"Which contacts work at Kùzu, Inc?"*  
- *"Which skills do I have?"*  

(Successful generations are shown below.)  
<Image src="/img/2025-02-27-kuzu-wasm-rag/successful-generations.png">


However, for **more complex queries** requiring **joins, filtering, and aggregation**, the model struggled. It often produced incorrect or incomplete Cypher queries for questions like:  
- *"Who endorsed me the most times?"*  
- *"Which contacts have worked with me at the same company?"*  

## Conclusion  

This experiment demonstrates the feasibility of **fully local, serverless Graph RAG** using **Kùzu-Wasm** and **WebLLM**. While the results are mixed, it highlights both the **advantages** and **challenges** of in-browser AI-powered graph querying.  

### **Pros**  
✅ **Privacy & Confidentiality** – All data remains on the user's device, ensuring complete privacy.  
✅ **Zero Installation & Configuration** – Runs in the browser with no setup required.  
✅ **Easy Deployment & Maintenance-Free** – Can be hosted on any static web service with **no need for database or LLM infrastructure**.  
✅ **Low/Zero Operational Cost** – Since computation happens on the client’s machine, there’s **no cloud cost** for database queries or LLM calls. A CDN can serve a large number of users efficiently.  

### **Cons**  
❌ **Slow Initial Loading** – Kùzu-Wasm takes ~10 seconds to load, and WebLLM requires ~300 seconds for the first model load (though subsequent loads are faster).  
❌ **Performance Depends on Client’s Device** – Query generation speed and execution depend on the user’s hardware.  
❌ **WebLLM Model Limitations** – The **distilled LLM struggles with complex queries**, especially those requiring multiple joins or aggregation.  
❌ **Limited Browser Compatibility** – Currently, some browsers (e.g., Safari) do not fully support WebLLM or WebGPU.  

### **Future Potential**  

Looking ahead, **in-browser computing** will continue to improve, making this approach more viable:  
- **Better Web Standards** – Technologies like **WebGPU (for faster computation)** and **WASM64 (removing the 4GB memory limit for WebAssembly)** will improve browser performance.  
- **Smaller, Smarter LLMs** – **More efficient distilled models** and **fine-tuning for query generation** could significantly improve Cypher query accuracy.  
- **Hardware Advancements** – With AI acceleration becoming a focus in modern hardware, **future devices will run LLMs much faster**.  
- **Broader Browser Support** – As browsers adopt these standards, compatibility issues will decrease.  

### **Final Thoughts**  

While the current implementation has limitations, **the core idea of fully local, private, and cost-free graph querying is promising**. As web technologies and LLM efficiency improve, an approach like this could become truly practical and widely usable in the future.
