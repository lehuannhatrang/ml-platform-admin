
export enum ResourceConditionType {
    Initialized = 'Initialized',
    PodScheduled = 'PodScheduled',
    ContainersReady = 'ContainersReady',
    Ready = 'Ready',
}

export interface ResourceCondition {
    type: ResourceConditionType
    status: string
    lastProbeTime: string
    lastTransitionTime: string
}
export const getStatusFromCondition = (conditions: ResourceCondition[]): string => {
    const enabledConditions = conditions.filter(c => c?.status === 'True')?.map(c => c.type)
    if (enabledConditions?.includes(ResourceConditionType.Ready)) {
        return 'Ready'
    }
    if(enabledConditions?.includes(ResourceConditionType.ContainersReady)) {
        return 'Containers Ready'
    }
    if(enabledConditions?.includes(ResourceConditionType.PodScheduled)) {
        return 'Scheduled'
    }
    if(enabledConditions?.includes(ResourceConditionType.Initialized)) {
        return 'Initialized'
    }
    return 'Unknown'
}