// Temporary IIFE to encapsulate.
const SpathyPackage = (() => {
  const GRAPH_ITEM_STATE = {
    DEFAULT: 0,
    ACTIVE: 1,
    INACTIVE: 2,
    FOCUSED: 3,
    MARKED_DELETE: 4,
  };

  const SPATHY_EVENTS = {
    COMPLETED_SEARCHING: 0,
    COMPLETED_RENDERING: 1,
  };

  const SPATHY_ENUMS = {GRAPH_ITEM_STATE, SPATHY_EVENTS};

  class NodeMap {
    constructor(nodeGridSize) {
      this.map = new Map();
      this.nodeGridSize = nodeGridSize;

      this.createNodes();
      this.createEdges();
    }

    reset() {
      this.map = new Map();
      this.createNodes();
      this.createEdges();
    }

    get(key) {
      return this.map.get(key);
    }

    getRandomWeight() {
      return ~~(Math.random() * 5) + 1;
    }

    createNode(id) {
      return {
        id,
        closestEdge: null,
        distance: 0,
        state: GRAPH_ITEM_STATE.DEFAULT,
        edges: []
      };
    }

    createWeightedEdge(from, to, distance) {
      return {
        from,
        to,
        state: GRAPH_ITEM_STATE.DEFAULT,
        totalDistance: 0,
        distance
      };
    }

    createNodes() {
      for (let row = 0; row < this.nodeGridSize; row++) {
        for (let col = 0; col < this.nodeGridSize; col++) {
          const id = `${row}.${col}`;
          const node = this.createNode(id);
          this.map.set(id, node);
        }
      }
    }

    createEdges() {
      // Create Edges
      for (let [id, node] of this.map) {
        const [row, col] = id.split(".").map(Number);
        const rightId = `${row + 1}.${col}`;
        const bottomId = `${row}.${col + 1}`;

        [rightId, bottomId].forEach((edgeId) => {
          if (this.map.has(edgeId)) {
            const distance = this.getRandomWeight();
            node.edges.push(
                this.createWeightedEdge(node, this.get(edgeId), distance));
          }
        });
      }
    }
  }

  class NodeSearchQueue {
    constructor(startNode) {
      const mockEdge = { to: startNode };
      this.startNode = startNode;
      this.edges = [mockEdge];
      this.edgeSet = new Set();
      this.nodeSet = new Set();
    }

    push(edge) {
      if (this.edgeSet.has(edge) || this.nodeSet.has(edge.to)) return;
      this.edgeSet.add(edge);
      this.nodeSet.add(edge.from);
      this.edges.push(edge);
    }

    dequeue() {
      const returnedEdge = this.edges[0];
      this.edges = this.edges.slice(1);

      if (!returnedEdge) return null;

      this.edgeSet.delete(returnedEdge);
      if (!this.edges.map(edge => edge.from).includes(returnedEdge.from)) {
        this.nodeSet.delete(returnedEdge.from);
      }

      return returnedEdge;
    }
    isActive(node) {
      return this.nodeSet.has(node);
    }
    isEmpty() {
      return this.edges.length === 0;
    }
  }

  class StateMachineQueue {
    constructor() {
      this.itemStates = [];
    }
    push(item, state) {
      this.itemStates.push({item, state})
    }
    dequeue() {
      const itemState = this.itemStates[0];
      this.itemStates = this.itemStates.slice(1);
      return itemState || null; 
    }
  }

  class Spathy {
    constructor(options = {}) {
      this.opts = Object.assign({}, this.getDefaultOptions_(), options);
      let ctx;
      if (!this.opts.ctx) {
        const canvas = document.createElement("canvas");    
        canvas.width = this.opts.canvasWidth;
        canvas.height = this.opts.canvasHeight;
        canvas.style = this.opts.canvasStyle;
        document.body.appendChild(canvas);
        this.ctx = canvas.getContext("2d");
        this.opts.ctx = this.ctx;
      } else {
        this.ctx = this.opts.ctx;
      }

      this.isActive = false;
      this.hasCompleted = false;
      this.eventEmitter = {};

      this.init_();
    }

    dispatch_(eventName) {
      const set = this.eventEmitter[eventName];
      if (!set) return;

      for (let fn of set.values()) {
        fn();
      }
    }

    init_() {
      this.createNodeMapAndQueues_();
      this.tick_();
    }

    createNodeMapAndQueues_() {
      this.isActive = false;
      this.hasCompleted = false;
      this.nodeMap = new NodeMap(this.opts.nodeGridSize);
      this.stateMachine = new StateMachineQueue();
      this.searchQueue = new NodeSearchQueue(this.nodeMap.get("0.0"));
    }

    getDefaultOptions_() {
      return {
        ctx: null,
        canvasHeight: 300,
        canvasWidth: 300,
        canvasStyle: 'border: 1px solid #efefef',
        isTextRendered: false,
        nodeGridSize: 11,
        speed: 10,
        getEdgeSize(edge) {
          return 2;
        },
        getNodeSize(node) {
          return 10;
        },
        getColorByState(state) {
          switch (state) {
            case GRAPH_ITEM_STATE.DEFAULT:
              return "#ccc";
            case GRAPH_ITEM_STATE.ACTIVE:
              return "#99C";
            case GRAPH_ITEM_STATE.INACTIVE:
              return "#FFF";
            case GRAPH_ITEM_STATE.FOCUSED:
              return "#0A0";
            case GRAPH_ITEM_STATE.MARKED_DELETE:
              return "#F00";
          }
        },
        getNodeColor(node) {
          return this.getColorByState(node.state);
        },
        getEdgeColor(edge) {
          return this.getColorByState(edge.state);
        },
        getNodePosition(node) {
          const gridWidthSize = this.canvasWidth / this.nodeGridSize;
          const gridHeightSize = this.canvasHeight / this.nodeGridSize;

          const [row, col] = node.id.split('.').map(Number);

          const x = gridWidthSize * row + gridWidthSize / 2;
          const y = gridHeightSize * col + gridHeightSize / 2;
          return {x, y};
        },
        preRender(ctx) {
          //ctx.fillRect(0,0, 25, 25);
        },
        postRender(ctx) {
          //ctx.fillRect(50, 50, 52, 51);
        }
      };
    }

    backTrackInactiveNodes_(node) {
      let backtrackNode = node;
      let clearNodeEdges = backtrackNode.edges || [];
      let isEveryEdgeInactive = clearNodeEdges.every(
        edge => edge.state === GRAPH_ITEM_STATE.INACTIVE
      );
      backtrackNode.state = GRAPH_ITEM_STATE.INACTIVE;
      this.stateMachine.push(backtrackNode, GRAPH_ITEM_STATE.MARKED_DELETE);

      const backTrackedItems = [backtrackNode];

      while (backtrackNode && backtrackNode.closestEdge) {
        backtrackNode.closestEdge.state = GRAPH_ITEM_STATE.INACTIVE;
        this.stateMachine.push(backtrackNode.closestEdge, GRAPH_ITEM_STATE.INACTIVE);
        backTrackedItems.push(backtrackNode.closestEdge);

        backtrackNode = backtrackNode.closestEdge.from || null;
        if (!backtrackNode) {
          break;
        }

        clearNodeEdges = backtrackNode.edges || [];
        isEveryEdgeInactive = clearNodeEdges.every(
          edge => edge.state === GRAPH_ITEM_STATE.INACTIVE || edge.state === GRAPH_ITEM_STATE.MARKED_DELETE
        );
        if (!isEveryEdgeInactive) {
          break;
        }
        backtrackNode.state = GRAPH_ITEM_STATE.INACTIVE;
        this.stateMachine.push(backtrackNode, GRAPH_ITEM_STATE.MARKED_DELETE);
        backTrackedItems.push(backtrackNode);
      }

      backTrackedItems.forEach(item => {
        this.stateMachine.push(item, GRAPH_ITEM_STATE.INACTIVE);
      });
    }

    drawNode_(node) {
      const { state, distance } = node;
      const size = this.opts.getNodeSize(node);
      const color = this.opts.getNodeColor(node);
      const {x, y} = this.opts.getNodePosition(node);
      this.ctx.fillStyle = color;

      this.ctx.beginPath();
      this.ctx.arc(x, y, size, 0, 2 * Math.PI);
      this.ctx.fill();
    }

    drawNodeText_(node) {
      const { distance } = node;
      const {x, y} = this.opts.getNodePosition(node);

      this.ctx.fillStyle = "#000";
      this.ctx.fillText(distance, x, y);
    }

    drawEdge_(startNode, edge) {
      const { edges } = startNode;
      const {x: centerX, y: centerY} = this.opts.getNodePosition(startNode);
      const { to, distance, state } = edge;
      const {x: connectX, y: connectY} = this.opts.getNodePosition(to);
      const color = this.opts.getEdgeColor(edge);

      this.ctx.strokeStyle = color;

      this.ctx.beginPath();
      this.ctx.moveTo(centerX, centerY);
      this.ctx.lineTo(connectX, connectY);
      this.ctx.stroke();
    }

    drawEdgeText_(startNode, edge) {
      const { edges } = startNode;
      const { x: fromX, y: fromY } = this.opts.getNodePosition(startNode);
      const { to, distance, state } = edge;
      const { x: toX, y: toY } = this.opts.getNodePosition(to);


      const textX = fromX + (toX - fromX) / 2;
      const textY = fromY + (toY - fromY) / 2;

      this.ctx.fillStyle = "#000";
      this.ctx.fillText(distance, textX, textY);
    }

    draw_() { 
      const map = this.nodeMap.map;
      for (let [,node] of this.nodeMap.map) {
        const { centerX, centerY, edges } = node;

        for (let edge of edges) {
          this.drawEdge_(node, edge);
          if (this.opts.isTextRendered) {
            this.drawEdgeText_(node, edge);      
          }
        }
        this.drawNode_(node);
        if (this.opts.isTextRendered) {
          this.drawNodeText_(node);
        }
      }
    }

    onTick_() {
      if (this.isActive) {
        this.renderLoop_();
      }
    }

    populateStates_() {
      const currentEdge = this.searchQueue.dequeue();
      const currentNode = (currentEdge && currentEdge.to) || null;

      let isInactiveAfterFocus = false;

      currentEdge.state = GRAPH_ITEM_STATE.FOCUSED;
      this.stateMachine.push(currentEdge, GRAPH_ITEM_STATE.FOCUSED);

      if (!currentNode.distance) {
        // No existing distance, this is the first time visiting the node
        currentNode.closestEdge = currentEdge;
        currentNode.distance = currentEdge.totalDistance || 0;
        currentNode.state = GRAPH_ITEM_STATE.FOCUSED;
        this.stateMachine.push(currentNode, GRAPH_ITEM_STATE.FOCUSED);
      } else if (currentEdge.totalDistance < currentNode.distance) {
        // The current examined edge has a smaller path than other nodes
        this.backTrackInactiveNodes_(currentNode);

        currentNode.closestEdge = currentEdge;
        currentNode.distance = currentEdge.totalDistance || 0;
        currentNode.state = GRAPH_ITEM_STATE.FOCUSED;
        this.stateMachine.push(currentNode, GRAPH_ITEM_STATE.FOCUSED);
      } else {
        isInactiveAfterFocus = true;
      }

      // Traverse edges connected to current node, adding to a BFS queue
      currentNode.edges.forEach(edge => {
        const { to, distance } = edge;

        if (!to.distance || currentNode.distance + distance < to.distance) {
          edge.totalDistance = currentNode.distance + distance;
          this.searchQueue.push(edge);
        }
      });

      const edgeState = isInactiveAfterFocus ? GRAPH_ITEM_STATE.INACTIVE : GRAPH_ITEM_STATE.ACTIVE;
      currentEdge.state = edgeState;
      currentNode.state = GRAPH_ITEM_STATE.ACTIVE;
      this.stateMachine.push(currentEdge, edgeState);
      this.stateMachine.push(currentNode, GRAPH_ITEM_STATE.ACTIVE);

      let clearNode = currentEdge.from;
      let clearNodeEdges = (clearNode && clearNode.edges) || [];
      const isEveryEdgeInactive = clearNodeEdges.every(
        edge => edge.state === GRAPH_ITEM_STATE.INACTIVE
      );
      if (isInactiveAfterFocus && isEveryEdgeInactive) {
        this.backTrackInactiveNodes_(clearNode);
      }

      if (this.searchQueue.isEmpty()) {
        this.dispatch_(SPATHY_EVENTS.COMPLETED_SEARCHING);
        return;
      }
      // recursively travel down
      this.populateStates_();
    }

    render_() {
      // Reset
      const canvas = this.ctx.canvas;
      this.ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Before rendering SPath
      this.opts.preRender(this.ctx);

      // Render SPath
      this.draw_();

      // After rendering SPath
      this.opts.postRender(this.ctx);
    }

    renderLoop_() {
      const itemState = this.stateMachine.dequeue();
      if (itemState) {
        itemState.item.state = itemState.state;
      } else if (!this.hasCompleted) {
        this.hasCompleted = true;
        this.dispatch_(SPATHY_EVENTS.COMPLETED_RENDERING);
      }

      this.render_();
    }

    resetNode_(node) {
      const {DEFAULT} = GRAPH_ITEM_STATE;
      node.state = DEFAULT;
      node.edges.forEach(edge => {
        edge.state = DEFAULT;
        if (edge.to.state !== DEFAULT) this.resetNode_(edge.to);
      });
    }

    resetNodes_() {
      this.resetNode_(this.searchQueue.startNode);
    }

    tick_() {
      this.onTick_();
      setTimeout(() => {
        this.tick_();
      }, this.opts.speed);
    }

    restart() {
      this.createNodeMapAndQueues_();
    }

    start() {    
      // TODO(tystarK): Webworker this for larger calculations?
      console.time('Calculation Time');
      this.subscribe(SPATHY_EVENTS.COMPLETED_SEARCHING, () => {
        console.log(2); //2
      });
      this.populateStates_();
      console.timeEnd('Calculation Time');
      console.time('Reset Time');
      this.resetNodes_();
      console.timeEnd('Reset Time');

      this.isActive = true;
    }

    stop() {
      this.isActive = false;
    }

    subscribe(eventName, callback) {
      if (!this.eventEmitter[eventName]) {
        this.eventEmitter[eventName] = new Set();
      }
      this.eventEmitter[eventName].add(callback);
    }

    unsubscribe(eventName, callback) {
      if (!this.eventEmitter[eventName]) return;
      this.eventEmitter[eventName].delete(callback);
    }
  }

  return {Spathy, SPATHY_ENUMS};
})();
