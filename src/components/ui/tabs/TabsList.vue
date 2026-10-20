<script lang="ts">
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

export const tabsListVariants = cva(
    'rounded-lg p-0.75 group-data-horizontal/tabs:h-8 data-[variant=line]:rounded-none group/tabs-list inline-flex w-fit items-center justify-center text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col',
    {
        variants: {
            variant: {
                default: 'bg-muted',
                line: 'gap-1 bg-transparent',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    },
);
export type TabsListVariants = VariantProps<typeof tabsListVariants>;
</script>

<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core';
import { cn } from 'cn';
import type { TabsListProps } from 'reka-ui';
import { TabsList } from 'reka-ui';
import type { HTMLAttributes } from 'vue';

const props = withDefaults(
    defineProps<
        TabsListProps & {
            class?: HTMLAttributes['class'];
            variant?: TabsListVariants['variant'];
        }
    >(),
    {
        variant: 'default',
    },
);

const delegatedProps = reactiveOmit(props, 'class', 'variant');
</script>

<template>
    <TabsList
        data-slot="tabs-list"
        :data-variant="variant"
        v-bind="delegatedProps"
        :class="cn(tabsListVariants({ variant }), props.class)"
    >
        <slot />
    </TabsList>
</template>
