
export enum ResourceConditionType {
    ScheduledFailed = 'Failed',
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
    reason?: string
    message?: string
}
export const getStatusFromCondition = (conditions: ResourceCondition[]): string => {
    let enabledConditions = conditions.filter(c => c?.status === 'True')?.map(c => c.type)
    if(!enabledConditions?.length && conditions?.length === 1) {
        enabledConditions = [ResourceConditionType.ScheduledFailed]
    }
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
    if(enabledConditions?.includes(ResourceConditionType.ScheduledFailed)) {
        return 'Failed'
    }
    return 'Unknown'
}

export const getStatusTagColor = (status: string) => {
    if (status === 'Ready') {
        return 'blue'
    }
    if (status === 'Containers Ready') {
        return 'orange'
    }
    if (status === 'Scheduled') {
        return 'green'
    }
    if (status === 'Initialized') {
        return 'purple'
    }
    if (status === 'Failed') {
        return 'red'
    }
    return 'default'
}

export const getWorkloadMessage  = (conditions: ResourceCondition[]): string[] => {
    const messages = conditions.filter(c => c?.message).map(c => `${c?.reason || 'Unknown'}: ${c.message}`)
    return messages
}
    