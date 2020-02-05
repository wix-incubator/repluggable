// Based on https://gist.github.com/chadhutchins/1440602

export class Graph {
    map: Map<string, Vertex>
    constructor() {
        this.map = new Map<string, Vertex>()
    }

    private addOrGetVertex(value: string) {
        if (!this.map.has(value)) {
            const vertex = new Vertex(value)
            this.map.set(value, vertex)
            return vertex
        }

        return this.map.get(value) as Vertex
    }

    addConnection(source: string, target: string) {
        this.addOrGetVertex(source).connections.push(this.addOrGetVertex(target))
    }
}

class Vertex {
    connections: Vertex[]
    index: number
    lowLink: number
    constructor(public name: string) {
        this.connections = []
        this.index = -1
        this.lowLink = -1
    }
}

class VertexStack {
    constructor(public vertices: Vertex[]) {}
    contains(vertex: Vertex) {
        for (const v of this.vertices) {
            if (v.name === vertex.name) {
                return true
            }
        }
        return false
    }
}

export class Tarjan {
    index: number
    stack: VertexStack
    scc: Vertex[][]
    constructor(private readonly graph: Graph) {
        this.index = 0
        this.stack = new VertexStack([])
        this.scc = []
    }

    run() {
        for (const v of this.graph.map.values()) {
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
        this.stack.vertices.push(vertex)

        for (const w of vertex.connections) {
            const v = vertex
            if (w.index < 0) {
                this.strongConnect(w)
                v.lowLink = Math.min(v.lowLink, w.lowLink)
            } else if (this.stack.contains(w)) {
                v.lowLink = Math.min(v.lowLink, w.index)
            }
        }

        if (vertex.lowLink === vertex.index) {
            const vertices = []
            let w = null
            if (this.stack.vertices.length > 0) {
                do {
                    w = this.stack.vertices.pop()
                    w && vertices.push(w)
                } while (vertex.name !== w?.name)
            }
            if (vertices.length > 0) {
                this.scc.push(vertices)
            }
        }
    }
}
