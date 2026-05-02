<script lang="ts">
  import { onMount } from 'svelte';
  import type { FormQuestion } from '$lib/types';
  import Input from '$lib/components/card/Input.svelte';
  import InputDual from '$lib/components/card/InputDual.svelte';
  import InputArea from '$lib/components/card/InputArea.svelte';
  import Radio from '$lib/components/card/Radio.svelte';
  import Checkbox from '$lib/components/card/Checkbox.svelte';
  import CheckboxImage from '$lib/components/card/CheckboxImage.svelte';
  import Dropdown from '$lib/components/card/Dropdown.svelte';
  import AvailabilityGrid from '$lib/components/applicant/AvailabilityGrid.svelte';

  let { question, storagePrefix = '' }: { question: FormQuestion; storagePrefix?: string } = $props();

  const storageKey = $derived(storagePrefix ? `${storagePrefix}_${question.id}` : question.id);

  let stringVal = $state('');
  let arrayVal = $state<string[]>([]);
  let dualVal1 = $state('');
  let dualVal2 = $state('');
  let availabilityRanges = $state<{ date: string; start: string; end: string }[]>([]);

  onMount(() => {
    if (question.type === 'checkbox' || question.type === 'checkbox_image') {
      const stored = localStorage.getItem(storageKey);
      arrayVal = stored ? stored.split(',').filter(Boolean) : [];
    } else if (question.type === 'input_dual') {
      dualVal1 = localStorage.getItem(`${storageKey}_1`) || '';
      dualVal2 = localStorage.getItem(`${storageKey}_2`) || '';
    } else if (question.type === 'availability') {
      const stored = localStorage.getItem(storageKey);
      availabilityRanges = stored ? JSON.parse(stored) : [];
    } else {
      stringVal = localStorage.getItem(storageKey) || '';
    }
  });

  function handleStringChange() {
    localStorage.setItem(storageKey, stringVal);
  }

  function handleArrayChange() {
    localStorage.setItem(storageKey, arrayVal.join(','));
  }

  function handleDualChange() {
    localStorage.setItem(`${storageKey}_1`, dualVal1);
    localStorage.setItem(`${storageKey}_2`, dualVal2);
  }

  function handleAvailabilityChange(detail: { slots: string[]; ranges: { date: string; start: string; end: string }[] }) {
    availabilityRanges = detail.ranges;
    localStorage.setItem(storageKey, JSON.stringify(availabilityRanges));
  }
</script>

{#if question.type === 'input'}
  <Input
    title={question.title}
    subtitle={question.subtitle || ''}
    id={question.id}
    bind:value={stringVal}
    on:change={handleStringChange}
  />
{:else if question.type === 'input_dual'}
  <InputDual
    title={question.title}
    subtitle={question.subtitle || ''}
    placeholder1={question.label1 || 'First'}
    placeholder2={question.label2 || 'Last'}
    bind:selected={dualVal1}
    bind:selected2={dualVal2}
    on:change={handleDualChange}
  />
{:else if question.type === 'textarea'}
  <InputArea
    title={question.title}
    subtitle={question.subtitle || ''}
    id={question.id}
    bind:value={stringVal}
    on:change={handleStringChange}
  />
{:else if question.type === 'radio'}
  <Radio
    title={question.title}
    subtitle={question.subtitle || ''}
    options={question.options || []}
    name={question.id}
    bind:selected={stringVal}
    on:change={handleStringChange}
  />
{:else if question.type === 'checkbox'}
  <Checkbox
    title={question.title}
    subtitle={question.subtitle || ''}
    options={question.options || []}
    name={question.id}
    bind:selected={arrayVal}
    on:change={handleArrayChange}
  />
{:else if question.type === 'checkbox_image'}
  <CheckboxImage
    title={question.title}
    subtitle={question.subtitle || ''}
    description={question.description || ''}
    options={question.options || []}
    name={question.id}
    imageSrc={question.imageSrc || ''}
    imageAlt={question.imageAlt || ''}
    linkName={question.linkName || ''}
    linkURL={question.linkURL || ''}
    bind:selected={arrayVal}
    on:change={handleArrayChange}
  />
{:else if question.type === 'dropdown'}
  <Dropdown
    title={question.title}
    subtitle={question.subtitle || ''}
    options={question.options || []}
    bind:selected={stringVal}
    on:change={handleStringChange}
  />
{:else if question.type === 'availability'}
  <div class="card p-3">
    <h5>{question.title}</h5>
    {#if question.subtitle}<p class="text-muted">{question.subtitle}</p>{/if}
    <AvailabilityGrid
      startDate={question.startDate || new Date().toISOString().split('T')[0]}
      endDate={question.endDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]}
      dayStart={question.dayStart || '09:00'}
      dayEnd={question.dayEnd || '17:00'}
      stepMinutes={question.stepMinutes || 30}
      initialRanges={availabilityRanges}
      onchange={handleAvailabilityChange}
    />
  </div>
{/if}
