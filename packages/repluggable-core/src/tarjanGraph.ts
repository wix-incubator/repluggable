/*
    Based on:
    https://en.wikipedia.org/wiki/Tarjan%27s_strongly_connected_components_algorithm
    https://gist.github.com/chadhutchins/1440602
*/

export class Graph {
    private readonly map = new Map<string, Vertex>()
    private addOrGetVertex(value: string) {
        let vertex = this.map.get(value)
        if (!vertex) {
            vertex = new Vertex(value)
            this.map.set(value, vertex)
        }
        return vertex
    }

    getVertices() {
        return this.map.values()
    }

    addConnection(source: string, target: string) {
        this.addOrGetVertex(source).connections.push(this.addOrGetVertex(target))
    }
}

class Vertex {
    connections: Vertex[] = []
    index = -1
    lowLink = -1
    constructor(public name: string) {}
}

export function getCycle(dependentGraph: { [key: string]: string[] }) {
    let queue = Object.keys(dependentGraph).map(node => [node])
    while (queue.length) {
        const batch = []
        for (const path of queue) {
            const parents = dependentGraph[path[0]] || []
            for (const node of parents) {
                if (node === path[path.length - 1]) {
                    return [node, ...path]
                }
                batch.push([node, ...path])
            }
        }
        queue = batch
    }
}

export class Tarjan {
    private index = 0
    private readonly stack: Vertex[] = []
    private readonly scc: Vertex[][] = []
    constructor(private readonly graph: Graph) {}

    run() {
        for (const v of this.graph.getVertices()) {
            if (v.index < 0) {
                this.strongConnect(v)
            }
        }
        return this.scc
    }

    private strongConnect(vertex: Vertex) {
        vertex.index = this.index
        vertex.lowLink = this.index
        this.index = this.index + 1
        this.stack.push(vertex)

        for (const w of vertex.connections) {
            const v = vertex
            if (w.index < 0) {
                this.strongConnect(w)
                v.lowLink = Math.min(v.lowLink, w.lowLink)
            } else if (this.stack.some(x => x.name === w.name)) {
                v.lowLink = Math.min(v.lowLink, w.index)
            }
        }

        if (vertex.lowLink === vertex.index) {
            const vertices = []
            let w = null
            if (this.stack.length > 0) {
                do {
                    w = this.stack.pop()
                    w && vertices.push(w)
                } while (vertex.name !== w?.name)
            }
            if (vertices.length > 0) {
                this.scc.push(vertices)
            }
        }
    }
}
