/*
Copyright 2024 The Karmada Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React, { useEffect, useState, useCallback } from 'react';
import { Card, Spin, Empty } from 'antd';
import { GetNodes } from '@/services';
import { useQuery } from '@tanstack/react-query';
import { ClusterOption } from '@/hooks/use-cluster';
import {
  ReactFlow,
  Background,
  Node as FlowNode,
  Edge,
  ConnectionLineType,
  MarkerType,
  Position,
  Handle,
  useReactFlow,
  ReactFlowProvider,
  Controls
} from '@xyflow/react';
import { CSSProperties } from 'react';
import '@xyflow/react/dist/style.css';

// Custom node components
// Helper to truncate long labels
const truncateText = (text: string, maxLength: number = 20) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

const CustomNode = ({ data, id }: { data: any, id: string }) => {
  const style: CSSProperties = data.style || {};
  const nodeType = data.nodeType;
  const label = data.label;
  const nodeRole = data.nodeRole;
  const nodeStatus = data.nodeStatus;
  
  // Add extra styling for node content to prevent overflow
  const contentStyle: CSSProperties = {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    padding: '4px',
    fontSize: nodeType === 'node' ? '11px' : '12px',
    fontWeight: nodeType === 'root' ? 'bold' : 'normal',
  };
  
  // Add tag for node role and status
  const tagStyle: CSSProperties = {
    display: 'inline-block',
    fontSize: '10px',
    padding: '1px 4px',
    borderRadius: '4px',
    marginLeft: '4px',
    backgroundColor: nodeRole === 'Master' ? '#faad14' : '#1890ff',
    color: 'white',
  };
  
  const statusStyle: CSSProperties = {
    display: 'inline-block',
    height: '8px',
    width: '8px',
    borderRadius: '50%',
    backgroundColor: nodeStatus === 'Ready' ? '#52c41a' : '#f5222d',
    marginRight: '4px',
  };
  
  return (
    <div style={style}>
      {/* Source handle on the right for outgoing connections */}
      {nodeType !== 'node' && (
        <Handle
          type="source"
          position={Position.Right}
          id={`${id}-source`}
          style={{ background: '#1890ff' }}
        />
      )}
      
      {/* Target handle on the left for incoming connections */}
      {nodeType !== 'root' && (
        <Handle
          type="target"
          position={Position.Left}
          id={`${id}-target`}
          style={{ background: nodeType === 'node' ? '#52c41a' : '#1890ff' }}
        />
      )}
      
      <div style={contentStyle}>
        {nodeType === 'node' && <span style={statusStyle}></span>}
        {truncateText(label, nodeType === 'node' ? 35 : 25)}
        {nodeType === 'node' && nodeRole && <span style={tagStyle}>{nodeRole}</span>}
      </div>
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

interface NodeTopologyGraphProps {
  selectedCluster: ClusterOption | null;
  activeTab?: string; // Optional prop to detect tab changes
}

// Wrap component that uses the ReactFlow hooks
const NodeTopologyGraphContent: React.FC<NodeTopologyGraphProps> = ({ selectedCluster, activeTab }) => {
  const reactFlowInstance = useReactFlow();
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [isLocked, setIsLocked] = useState(true); // Graph is locked by default

  // Fetch nodes data for topology graph
  const { data: nodesData, isLoading: nodesLoading } = useQuery({
    queryKey: ['GetNodes', selectedCluster?.value],
    queryFn: async () => {
      const ret = await GetNodes({}, selectedCluster || undefined);
      return ret.data;
    },
  });

  // Prepare node and edge data for the topology graph when nodesData changes
  useEffect(() => {
    if (!nodesData?.items) return;
    prepareFlowData();
  }, [nodesData]);
  
  // Fit view whenever tab changes or when initially loaded
  useEffect(() => {
    // Small delay to ensure the graph is properly rendered
    const timer = setTimeout(() => {
      if (nodes.length > 0) {
        reactFlowInstance.fitView({
          padding: 0.2,
          includeHiddenNodes: false,
          duration: 800
        });
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [nodes, activeTab, reactFlowInstance]);

  // Function to prepare data for ReactFlow
  const prepareFlowData = () => {
    if (!nodesData?.items) return;
    
    const newNodes: FlowNode[] = [];
    const newEdges: Edge[] = [];
    
    // Determine if we're showing a specific cluster or all clusters
    const isSpecificCluster = selectedCluster?.value && selectedCluster.value !== 'ALL';
    const selectedClusterName = selectedCluster?.value;
    const rootLabel = isSpecificCluster ? selectedCluster.label : 'mgmt-cluster';
    
    // Add root node
    newNodes.push({
      id: 'root',
      type: 'custom',
      data: { 
        label: rootLabel,
        nodeType: 'root',
        style: {
          background: '#91d5ff',
          border: '1px solid #5cdbd3',
          borderRadius: '8px',
          padding: '10px',
          width: 150,
        }
      },
      position: { x: 50, y: 300 }, // Position root node on the left side vertically centered
    });
    
    // Group nodes by cluster
    const clusterNodes: Record<string, string[]> = {};
    const yOffset = 50; // Starting vertical position
    const ySpacingBetweenClusters = 300; // Increased vertical space between clusters to prevent overlap
    const nodeVerticalSpacing = 80; // Vertical space between individual nodes
    const xSpacingBetweenLevels = 300; // Horizontal spacing between hierarchy levels
    
    // Process all clusters first
    const uniqueClusters = [...new Set(
      nodesData.items.map((node: any) => 
        node.objectMeta.annotations?.['cluster.x-k8s.io/cluster-name'] || 'unknown'
      )
    )];
    
    // Analyze clusters to determine needed space
    const clusterSizes: Record<string, {master: number, worker: number}> = {};
    
    // Count the number of master and worker nodes in each cluster
    nodesData.items.forEach((node: any) => {
      const clusterName = node.objectMeta.annotations?.['cluster.x-k8s.io/cluster-name'] || 'unknown';
      const nodeRole = Object.keys(node.objectMeta.labels || {}).find(key => key === 'node-role.kubernetes.io/control-plane') ? 'Master' : 'Worker';
      
      if (!clusterSizes[clusterName]) {
        clusterSizes[clusterName] = {master: 0, worker: 0};
      }
      
      if (nodeRole === 'Master') {
        clusterSizes[clusterName].master += 1;
      } else {
        clusterSizes[clusterName].worker += 1;
      }
    });
    
    // Filter clusters based on the selected cluster
    
    // Filter clusters based on selection
    const clustersToShow = isSpecificCluster 
      ? uniqueClusters.filter(cluster => cluster !== selectedClusterName)
      : uniqueClusters;
    
    // Add cluster nodes
    clustersToShow.forEach((clusterName: string, index: number) => {
      const clusterId = `cluster-${clusterName}`;
      clusterNodes[clusterName] = [];
      
      // Calculate how much vertical space this cluster will need
      const clusterSize = clusterSizes[clusterName] || {master: 0, worker: 0};
      const totalNodesInCluster = clusterSize.master + clusterSize.worker;
      
      // Calculate cluster center position - position it at vertical center of its nodes
      const clusterCenterY = yOffset + (index * ySpacingBetweenClusters) + 
                             ((Math.max(clusterSize.master, clusterSize.worker) * nodeVerticalSpacing) / 2);
      
      // Create cluster node
      newNodes.push({
        id: clusterId,
        type: 'custom',
        data: { 
          label: `${clusterName} (${totalNodesInCluster} nodes)`,
          nodeType: 'cluster',
          style: {
            background: '#e6f7ff',
            border: '1px solid #1890ff',
            borderRadius: '6px',
            padding: '10px',
            width: 150,
          }
        },
        // Position clusters to the right of the root node, spreading them vertically
        position: { x: 250 + xSpacingBetweenLevels, y: clusterCenterY },
      });
      
      // Create edge from root to cluster
      newEdges.push({
        id: `edge-root-${clusterId}`,
        source: 'root',
        sourceHandle: 'root-source',
        target: clusterId,
        targetHandle: `${clusterId}-target`,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#1890ff' },
      });
    });
    
    // Now process all nodes
    nodesData.items.forEach((node) => {
      const clusterName = node.objectMeta.annotations?.['cluster.x-k8s.io/cluster-name'] || 'unknown';
      const clusterId = `cluster-${clusterName}`;
      const nodeId = `node-${node.objectMeta.name}-${clusterName}`;
      
      const nodeRole = Object.keys(node.objectMeta.labels || {}).find(key => key === 'node-role.kubernetes.io/control-plane') ? 'Master' : 'Worker';
      const nodeStatus = node.status.conditions.find((c: any) => c.type === 'Ready') ? 'Ready' : 'Not Ready';
      
      // Determine if this node belongs to the selected cluster
      
      // If this is the currently selected cluster in specific cluster mode, 
      // we connect nodes directly to root instead of to a cluster node
      const isSelectedClusterNode = isSpecificCluster && clusterName === selectedClusterName;
      
      // Store the node id in the cluster's node list if it's not the selected cluster
      if (!isSelectedClusterNode) {
        clusterNodes[clusterName] = clusterNodes[clusterName] || [];
        clusterNodes[clusterName].push(nodeId);
      }
      
      // Calculate position based on cluster
      const clusterIndex = isSelectedClusterNode ? 0 : clustersToShow.indexOf(clusterName);
      
      // Get count of nodes of this type (Master/Worker) in this cluster for positioning
      const sameRoleNodesInCluster = nodesData.items.filter((n: any) => 
        (n.objectMeta.annotations?.['cluster.x-k8s.io/cluster-name'] === clusterName) &&
        (Object.keys(n.objectMeta.labels || {}).find(key => key === 'node-role.kubernetes.io/control-plane') ? 'Master' : 'Worker') === nodeRole
      );
      
      // Position index within role group
      const indexInRoleGroup = sameRoleNodesInCluster.findIndex((n: any) => n.objectMeta.name === node.objectMeta.name);
      
      // Masters on top half, Workers on bottom half
      // Get the base Y position for this cluster
      const clusterBaseY = yOffset + (clusterIndex * ySpacingBetweenClusters);
      
      // Calculate the final position of this node
      let nodeY;
      if (nodeRole === 'Master') {
        // Position masters in the top section with proper spacing
        nodeY = clusterBaseY - (clusterSizes[clusterName].master * nodeVerticalSpacing / 2) + (indexInRoleGroup * nodeVerticalSpacing);
      } else {
        // Position workers in the bottom section with proper spacing - start below the master nodes
        const masterSectionHeight = clusterSizes[clusterName].master * nodeVerticalSpacing;
        nodeY = clusterBaseY + (masterSectionHeight / 2) + (indexInRoleGroup * nodeVerticalSpacing);
      }
      
      // Position in the horizontal flow
      // For selected cluster nodes, position them right of the root
      // For other nodes, position them right of their cluster nodes
      const position = {
        x: isSelectedClusterNode 
          ? 250 + xSpacingBetweenLevels // Position selected cluster nodes directly after root
          : 250 + (xSpacingBetweenLevels * 2), // Position other nodes after their cluster
        y: nodeY
      };
      
      // Create node object
      newNodes.push({
        id: nodeId,
        type: 'custom',
        data: { 
          label: `${node.objectMeta.name}`,
          nodeType: 'node',
          nodeRole,
          nodeStatus,
          style: {
            background: nodeStatus === 'Ready' ? '#f6ffed' : '#fff1f0',
            border: `1px solid ${nodeStatus === 'Ready' ? '#52c41a' : '#f5222d'}`,
            borderRadius: '4px',
            padding: '4px',
            width: 250
          }
        },
        position: position,
      });
      
      // Create edge - connect to root if this is the selected cluster node
      // Otherwise connect to respective cluster node
      if (isSelectedClusterNode) {
        newEdges.push({
          id: `edge-root-${nodeId}`,
          source: 'root',
          sourceHandle: 'root-source',
          target: nodeId,
          targetHandle: `${nodeId}-target`,
          type: 'smoothstep',
          style: { stroke: nodeStatus === 'Ready' ? '#52c41a' : '#f5222d' },
        });
      } else {
        newEdges.push({
          id: `edge-${clusterId}-${nodeId}`,
          source: clusterId,
          sourceHandle: `${clusterId}-source`,
          target: nodeId,
          targetHandle: `${nodeId}-target`,
          type: 'smoothstep',
          style: { stroke: nodeStatus === 'Ready' ? '#52c41a' : '#f5222d' },
        });
      }
    });
    
    setNodes(newNodes);
    setEdges(newEdges);
  };
  
  // Handle wheel events when graph is locked to prevent zoom on scroll
  const handleWheel = useCallback((event: React.WheelEvent) => {
    if (isLocked) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, [isLocked]);

  return (
    <Card 
      title="Node Topology" 
      style={{ minHeight: 600 }}
    >
      {nodesLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
          <Spin size="large" />
        </div>
      ) : (
        <div 
          style={{ height: 600, width: '100%' }}
          onWheel={handleWheel}
        >
          {nodes.length > 0 ? (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              nodesDraggable={!isLocked}
              elementsSelectable={!isLocked}
              zoomOnDoubleClick={!isLocked}
              panOnScroll={!isLocked}
              panOnDrag={!isLocked}
              zoomOnPinch={!isLocked}
              zoomOnScroll={!isLocked}
              preventScrolling={isLocked}
              defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
              minZoom={0.2}
              maxZoom={1.5}
              connectionLineType={ConnectionLineType.SmoothStep}
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls 
                onInteractiveChange={(interactiveStatus) => setIsLocked(!interactiveStatus)}
              />
            </ReactFlow>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Empty description="No nodes data available" />
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

// Wrap the component with ReactFlowProvider to enable ReactFlow hooks
const NodeTopologyGraph: React.FC<NodeTopologyGraphProps> = (props) => {
  return (
    <ReactFlowProvider>
      <NodeTopologyGraphContent {...props} />
    </ReactFlowProvider>
  );
};

export default NodeTopologyGraph;
