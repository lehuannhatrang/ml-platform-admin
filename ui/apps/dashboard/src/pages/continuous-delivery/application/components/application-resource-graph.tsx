import React, { useMemo } from 'react';
import { Card, Tag, Spin } from 'antd';
import { DeploymentUnitOutlined, CloudServerOutlined, ApiOutlined, ContainerOutlined } from '@ant-design/icons';
import { ArgoApplication, GetArgoApplicationDetail } from '@/services/argocd';
import { getSyncStatusColor, getHealthStatusColor } from '@/utils/argo';
import { useQuery } from '@tanstack/react-query';
import {
  ReactFlow,
  Background,
  Controls,
  Node,
  Edge,
  Position,
  ConnectionLineType,
  MarkerType,
  Handle
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// Define Resource type based on what's available in the application status
interface Resource {
  kind: string;
  name: string;
  namespace: string;
  status?: string;
  health?: {
    status: string;
    message?: string;
  };
  uid?: string;
  creationTimestamp?: string;
  children?: Resource[];
}

// Custom node component for resource nodes
interface ResourceNodeProps {
  data: {
    resource: Resource;
    hasChildren: boolean;
    onToggle: (id: string) => void;
  };
}

// Input node component for the root application node
interface InputNodeProps {
  data: {
    resource: Resource;
    hasChildren: boolean;
    onToggle: (id: string) => void;
  };
}

const InputNode = ({ data }: InputNodeProps) => {
  const { resource } = data;
  const syncColor = getSyncStatusColor(resource.status || '');
  const healthColor = getHealthStatusColor(resource.health?.status || '');
  const nodeId = resource.uid || `${resource.kind}-${resource.name}-${resource.namespace}`;

  // Function to get icon based on resource kind
  const getResourceIcon = () => {
    return <DeploymentUnitOutlined style={{ fontSize: '16px', color: '#1890ff' }} />;
  };

  return (
    <div 
      className="input-node" 
      style={{ 
        border: '1px solid #1890ff',
        borderRadius: '4px',
        padding: '8px',
        width: '200px',
        backgroundColor: '#e6f7ff',
        boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
      }}
    >
      <Handle
        type="source"
        position={Position.Right}
        id={`${nodeId}-source`}
        style={{ background: '#1890ff', width: '8px', height: '8px' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
        <div style={{ marginRight: '8px' }}>{getResourceIcon()}</div>
        <div style={{ fontWeight: 'bold', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{resource.name}</div>
      </div>
      <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>{resource.kind}</div>
      <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
        <Tag color={syncColor} style={{ margin: 0 }}>{resource.status}</Tag>
        {resource.health && (
          <Tag color={healthColor} style={{ margin: 0 }}>{resource.health.status}</Tag>
        )}
      </div>
    </div>
  );
};

const ResourceNode = ({ data }: ResourceNodeProps) => {
  const { resource } = data;
  const syncColor = getSyncStatusColor(resource.status || '');
  const healthColor = getHealthStatusColor(resource.health?.status || '');
  const nodeId = resource.uid || `${resource.kind}-${resource.name}-${resource.namespace}`;

  // Function to get icon based on resource kind
  const getResourceIcon = (kind: string | undefined) => {
    switch (kind?.toLowerCase()) {
      case 'deployment':
      case 'statefulset':
      case 'daemonset':
      case 'job':
      case 'cronjob':
        return <DeploymentUnitOutlined style={{ fontSize: '16px' }} />;
      case 'service':
      case 'ingress':
      case 'networkpolicy':
        return <ApiOutlined style={{ fontSize: '16px' }} />;
      case 'persistentvolume':
      case 'persistentvolumeclaim':
      case 'configmap':
      case 'secret':
        return <CloudServerOutlined style={{ fontSize: '16px' }} />;
      default:
        return <ContainerOutlined style={{ fontSize: '16px' }} />;
    }
  };

  return (
    <div 
      className="resource-node" 
      style={{ 
        border: '1px solid #d9d9d9',
        borderRadius: '4px',
        padding: '8px',
        width: '200px',
        backgroundColor: 'white',
        boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
      }}
    >
      <Handle
        type="source"
        position={Position.Right}
        id={`${nodeId}-source`}
        style={{ background: '#555', width: '8px', height: '8px' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id={`${nodeId}-target`}
        style={{ background: '#555', width: '8px', height: '8px' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
        <div style={{ marginRight: '8px' }}>{getResourceIcon(resource.kind)}</div>
        <div style={{ fontWeight: 'bold', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{resource.name}</div>
      </div>
      <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>{resource.kind}</div>
      <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
        <Tag color={syncColor} style={{ margin: 0 }}>{resource.status}</Tag>
        {resource.health && (
          <Tag color={healthColor} style={{ margin: 0 }}>{resource.health.status}</Tag>
        )}
      </div>
    </div>
  );
};

// Define custom node types
const nodeTypes = {
  resourceNode: ResourceNode,
  InputNode: InputNode
} as const;

interface ApplicationResourceGraphProps {
  application: ArgoApplication;
  loading?: boolean;
}

export const ApplicationResourceGraph: React.FC<ApplicationResourceGraphProps> = ({ 
  application, 
  loading = false 
}) => {
  const {
    data: applicationDetail,
    isLoading: resourcesLoading,
    error: queryError
  } = useQuery({
    queryKey: ['application-resources', application?.metadata?.labels?.cluster, application?.metadata?.name],
    queryFn: async () => {
      if (!application?.metadata?.name || !application?.metadata?.labels?.cluster) {
        throw new Error('Application or cluster information missing');
      }
      
      const clusterName = application.metadata.labels.cluster;
      const applicationName = application.metadata.name;
      
      const response = await GetArgoApplicationDetail(clusterName, applicationName);
      return response.data;
    },
    enabled: !!application?.metadata?.name && !!application?.metadata?.labels?.cluster,
    staleTime: 10000,
  });

  // Extract resources from query result
  const resources = applicationDetail?.resources || [];1
  // Function to build the nodes and edges for ReactFlow
  const { nodes, edges } = useMemo(() => {
    const rootId = "application-root";
    
    // Build nodes and edges for ReactFlow
    const graphNodes: Node[] = [];
    const graphEdges: Edge[] = [];
    
    // Create application root node
    graphNodes.push({
      id: rootId,
      type: 'InputNode',
      position: { x: 0, y: 0 },
      data: { 
        resource: {
          kind: "Application",
          name: application.metadata?.name || "",
          namespace: application.metadata?.namespace || "",
          status: application.status?.sync?.status || "Unknown",
          health: application.status?.health,
          uid: rootId, // Add uid to ensure handle ID is consistent
        },
        hasChildren: resources.length > 0,
        isExpanded: true,
        onToggle: () => {}
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
    
    // Function to add a node and its children to the graph
    const addNodeAndChildren = (
      resource: Resource, 
      parentId: string | null, 
      level: number,
      xPos: number,
      yPos: number,
      yOffset = 150
    ) => {
      const id = resource.uid || `${resource.kind}-${resource.name}-${resource.namespace}`;
      const hasChildren = resource.children && resource.children.length > 0;
      
      // Add node
      graphNodes.push({
        id,
        type: 'resourceNode',
        position: { x: xPos, y: yPos },
        data: { 
          resource,
          hasChildren,
          isExpanded: true,
          onToggle: () => {}
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left
      });
      
      // Connect to parent
      if (parentId && parentId !== id) {
        graphEdges.push({
          id: `edge-${parentId}-${id}`,
          source: parentId,
          target: id,
          sourceHandle: `${parentId}-source`,
          targetHandle: `${id}-target`,
          type: ConnectionLineType.SmoothStep,
          animated: resource.status !== 'Synced' && resource.status !== 'Ready' && resource.status !== 'Healthy' && resource.status !== 'Running',
          style: { 
            stroke: resource.status !== 'Synced' && resource.status !== 'Ready' && resource.status !== 'Healthy' && resource.status !== 'Running' ? '#faad14' : '#b1b1b7',
            strokeWidth: 2,
            strokeDasharray: resource.status !== 'Synced' && resource.status !== 'Ready' && resource.status !== 'Healthy' && resource.status !== 'Running' ? '5,5' : undefined
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 15,
            height: 15,
            color: resource.status !== 'Synced' && resource.status !== 'Ready' && resource.status !== 'Healthy' && resource.status !== 'Running' ? '#faad14' : '#b1b1b7'
          }
        });
      }
      
      // Add children if the node is expanded
      if (hasChildren) {
        const childXPos = xPos + 300;
        let childYPos = yPos - ((resource.children?.length || 0) - 1) * yOffset / 2;
        
        resource.children?.forEach(child => {
          addNodeAndChildren(child, id, level + 1, childXPos, childYPos, yOffset);
          childYPos += yOffset;
        });
      }
    };
    
    // Arrange root level resources
    if (resources.length > 0) {
      let rootYPos = 0 - (resources.length - 1) * 150 / 2;
      
      resources.forEach((resource: Resource) => {
        addNodeAndChildren(resource, rootId, 1, 300, rootYPos, 150);
        rootYPos += 150;
      });
    }
    
    // Check for any self-connecting edges and remove them
    const filteredEdges = graphEdges.filter(edge => {
      const isSelfConnection = edge.source === edge.target;
      return !isSelfConnection;
    });
    
    return { nodes: graphNodes, edges: filteredEdges };
  }, [application, resources]);

  if (loading || resourcesLoading) {
    return (
      <Card style={{ minHeight: 400 }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  if (queryError) {
    return (
      <Card style={{ minHeight: 400 }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
          <p>Failed to load application resources</p>
        </div>
      </Card>
    );
  }

  return (
    <Card 
      title="Application Resources"
      style={{ minHeight: 800 }}
      extra={
        <div>
          <Tag color={getSyncStatusColor(application.status?.sync?.status || '')}>
            {application.status?.sync?.status || 'Unknown'}
          </Tag>
          <Tag color={getHealthStatusColor(application.status?.health?.status || '')}>
            {application.status?.health?.status || 'Unknown'}
          </Tag>
        </div>
      }
    >
      <div style={{ height: 750 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          nodeTypes={nodeTypes}
          defaultEdgeOptions={{
            type: ConnectionLineType.SmoothStep,
            style: { strokeWidth: 3, stroke: '#333' },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 15,
              height: 15,
              color: '#333'
            }
          }}
          connectionLineType={ConnectionLineType.SmoothStep}
          proOptions={{ hideAttribution: true }}
          elementsSelectable={true}
          snapToGrid={true}
          nodesConnectable={true}
          nodesDraggable={true}
          minZoom={0.5}
          maxZoom={2}
          className="react-flow-container"
          style={{ background: '#f5f5f5', width: '100%', height: '100%' }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </Card>
  );
};

export default ApplicationResourceGraph;
